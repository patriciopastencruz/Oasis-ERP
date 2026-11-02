import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, defaultClosingDate, santiagoToday } from "../domain/daily-closing";
import { loadGroupWeeklyReport } from "./group-weekly-queries";
import { combineTotals, type OpsKpis } from "../domain/ops-kpis";
import { SUPPORT_REFERENCE_UNIT } from "../domain/support-bonus";
import {
  DEFAULT_BONUS_WEIGHTS,
  DEFAULT_INSPECTION_MAX_WAIT,
  cappedOccupancyPct,
  closingDeadline,
  computeBonus,
  isWeekendDay,
  type BonusInput,
  type BonusWeights,
} from "../domain/reception-bonus";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Unit = { id: string; code: string; name: string };

const santiagoDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));

export function monthBounds(month: string) {
  const start = `${month}-01`;
  const next = new Date(`${start}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = addDays(next.toISOString().slice(0, 10), -1);
  return { start, end };
}

export type BonusConfig = {
  pool: number;
  weights: BonusWeights;
  surveyGoal: number;
  surveyMinResponses: number;
  inspectionMaxWait: number;
  configured: boolean;
};

const defaultConfig: BonusConfig = {
  pool: 0,
  weights: DEFAULT_BONUS_WEIGHTS,
  surveyGoal: 4,
  surveyMinResponses: 5,
  inspectionMaxWait: DEFAULT_INSPECTION_MAX_WAIT,
  configured: false,
};

export type SavedBonus = { points: number; amount: number; gateApplied: boolean; savedAt: string; poolAmount: number };

/** Bono de recepción del mes para cada hostal, calculado con los datos de hoy. */
export async function loadReceptionBonus(supabase: Supabase, units: Unit[], month: string) {
  const today = santiagoToday();
  const { start, end } = monthBounds(month);
  const provisional = end >= today;
  const reference = provisional ? today : end;
  const workingDay = defaultClosingDate();
  return Promise.all(units.map((unit) => loadUnit(supabase, unit, month, start, reference, workingDay, provisional)));
}

async function loadUnit(supabase: Supabase, unit: Unit, month: string, start: string, reference: string, workingDay: string, provisional: boolean) {
  const report = await loadGroupWeeklyReport(supabase, [unit], reference, workingDay);
  const h = report.hostels[0];
  const lastDue = reference < addDays(workingDay, -1) ? reference : addDays(workingDay, -1);

  const [configRes, savedRes, closingsRes, surveysRes, bookingRes] = await Promise.all([
    supabase
      .from("lodging_bonus_config")
      .select("pool_amount,weights,survey_goal,survey_min_responses,inspection_max_wait_minutes")
      .eq("business_unit_id", unit.id)
      .maybeSingle(),
    supabase
      .from("lodging_bonus_results")
      .select("points,amount,gate_applied,saved_at,pool_amount")
      .eq("business_unit_id", unit.id)
      .eq("month", start)
      .maybeSingle(),
    supabase
      .from("lodging_daily_closings")
      .select("closing_date,first_issued_at")
      .eq("business_unit_id", unit.id)
      .eq("status", "issued")
      .gte("closing_date", start)
      .lte("closing_date", lastDue),
    supabase
      .from("lodging_satisfaction_surveys")
      .select("created_at,cleanliness,comfort,staff,value_for_money")
      .eq("business_unit_id", unit.id)
      .gte("created_at", `${start}T00:00:00-06:00`)
      .lt("created_at", `${addDays(reference, 1)}T06:00:00Z`),
    // El puntaje de Booking es una lectura del momento: el bono, también el de un mes cerrado, usa el último registrado.
    supabase
      .from("lodging_review_scores")
      .select("recorded_on,score")
      .eq("business_unit_id", unit.id)
      .eq("source", "booking")
      .lte("recorded_on", santiagoToday())
      .order("recorded_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const r of [configRes, closingsRes, surveysRes, bookingRes]) if (r.error) throw r.error;

  const c = configRes.data;
  const config: BonusConfig = c
    ? {
        pool: Number(c.pool_amount),
        weights: { ...DEFAULT_BONUS_WEIGHTS, ...(c.weights as Partial<BonusWeights>) },
        surveyGoal: Number(c.survey_goal),
        surveyMinResponses: Number(c.survey_min_responses),
        inspectionMaxWait: Number(c.inspection_max_wait_minutes),
        configured: true,
      }
    : defaultConfig;

  const bookingReading = bookingRes.data ? { recordedOn: bookingRes.data.recorded_on as string, score: Number(bookingRes.data.score) } : null;

  // Los mismos 6 indicadores de todo el mes o solo de sábados y domingos (evaluación de la persona de apoyo).
  const weekendDates: string[] = [];
  for (let d = start; d <= reference; d = addDays(d, 1)) if (isWeekendDay(d)) weekendDates.push(d);
  const wantWeekend = unit.code === SUPPORT_REFERENCE_UNIT;
  const weekendInspections =
    wantWeekend && h.inspections.available && h.inspections.enabled
      ? await Promise.all(weekendDates.map((d) => supabase.rpc("lodging_ops_kpis", { target_unit: unit.id, from_date: d, to_date: d })))
      : null;

  const firstIssued = new Map((closingsRes.data ?? []).map((c) => [c.closing_date, c.first_issued_at as string | null]));
  const evaluate = (weekendOnly: boolean) => {
    const inScope = (day: string) => !weekendOnly || isWeekendDay(day);
    let dueDays = 0;
    for (let d = start; d <= lastDue; d = addDays(d, 1)) if (inScope(d)) dueDays++;

    const surveys = (surveysRes.data ?? []).filter((s) => {
      const day = santiagoDay(s.created_at);
      return day >= start && day <= reference && inScope(day);
    });
    const surveyAvg = surveys.length
      ? surveys.reduce((sum, s) => sum + (s.cleanliness + s.comfort + s.staff + s.value_for_money) / 4, 0) / surveys.length
      : null;

    // Cierres: cada día vencido debe haberse emitido por primera vez antes de que terminara su día de trabajo,
    // lo haya hecho la recepcionista o la persona de apoyo.
    const lateDays: number[] = [];
    let onTimeClosings = 0;
    for (let d = start; d <= lastDue; d = addDays(d, 1)) {
      if (!inScope(d)) continue;
      const issuedAt = firstIssued.get(d) ?? null;
      if (issuedAt !== null && new Date(issuedAt).getTime() < closingDeadline(d).getTime()) onTimeClosings++;
      else lateDays.push(Number(d.slice(8)));
    }
    // Saldos: estadías ya terminadas con deuda, sin contar las de empresa que paga después.
    const unpaid = h.balances.rows.filter((r) => !r.postpaid_company && r.check_out <= lastDue && inScope(r.check_out));
    const unpaidTotal = unpaid.reduce((sum, r) => sum + r.balance, 0);

    const days = h.month.days.filter((d) => inScope(d.date));
    const soldNights = days.reduce((sum, d) => sum + d.sold, 0);
    const soldRevenue = days.reduce((sum, d) => sum + d.soldRevenue, 0);

    const insp = h.inspections;
    const weekendKpis = weekendInspections && weekendInspections.every((r) => !r.error) ? combineTotals(weekendInspections.map((r) => r.data as OpsKpis)) : null;
    const inspections: BonusInput["inspections"] =
      weekendOnly && insp.available && insp.enabled
        ? {
            cleanings: weekendKpis ? weekendKpis.cleanings : null,
            inspected: weekendKpis ? weekendKpis.inspected : 0,
            avgWaitMinutes: weekendKpis ? weekendKpis.avgWaitMinutes : null,
            maxWaitMinutes: config.inspectionMaxWait,
          }
        : {
            cleanings: insp.available && insp.enabled ? insp.cleanings : null,
            inspected: insp.available ? insp.inspectedCleanings : 0,
            avgWaitMinutes: insp.available ? insp.avgWaitMinutes : null,
            maxWaitMinutes: config.inspectionMaxWait,
          };

    const input: BonusInput = {
      pool: config.pool,
      weights: config.weights,
      occupancy: { value: weekendOnly ? cappedOccupancyPct(days, h.month.totalRooms) : cappedOccupancyPct(h.month.days, h.month.totalRooms), goal: h.goals.occupancyPct },
      adr: weekendOnly
        ? { value: soldNights ? soldRevenue / soldNights : null, goal: h.goals.averageRate }
        : { value: h.month.soldNights ? h.month.adr : null, goal: h.goals.averageRate },
      booking: {
        value: bookingReading ? bookingReading.score : null,
        goal: h.goals.bookingScore,
      },
      survey: { value: surveyAvg, goal: config.surveyGoal, responses: surveys.length, minResponses: config.surveyMinResponses },
      inspections,
      order: {
        closings: dueDays > 0 ? { due: dueDays, onTime: onTimeClosings, lateDays } : null,
        balances: { count: unpaid.length, total: unpaidTotal },
      },
    };
    return { input, result: computeBonus(input), counts: { dueDays, surveyResponses: surveys.length } };
  };
  const { input, result, counts } = evaluate(false);
  const weekend = wantWeekend ? evaluate(true) : null;
  const saved: SavedBonus | null = savedRes.data
    ? {
        points: Number(savedRes.data.points),
        amount: Number(savedRes.data.amount),
        gateApplied: savedRes.data.gate_applied,
        savedAt: savedRes.data.saved_at,
        poolAmount: Number(savedRes.data.pool_amount),
      }
    : null;
  return {
    unit,
    month,
    monthStart: start,
    reference,
    provisional,
    config,
    input,
    bookingRecordedOn: bookingReading?.recordedOn ?? null,
    result,
    saved,
    counts,
    weekend,
  };
}

export type UnitBonus = Awaited<ReturnType<typeof loadUnit>>;
