import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, defaultClosingDate, santiagoToday } from "../domain/daily-closing";
import { loadGroupWeeklyReport } from "./group-weekly-queries";
import { RECEIPT_RESOLVE_HOURS, computeSupervisorBonus, type SupervisorInput } from "../domain/supervisor-bonus";
import {
  DEFAULT_BONUS_WEIGHTS,
  DEFAULT_INSPECTION_MAX_WAIT,
  cappedOccupancyPct,
  closingDeadline,
  computeBonus,
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
  supervisorPool: number;
  configured: boolean;
};

const defaultConfig: BonusConfig = {
  pool: 0,
  weights: DEFAULT_BONUS_WEIGHTS,
  surveyGoal: 4,
  surveyMinResponses: 5,
  inspectionMaxWait: DEFAULT_INSPECTION_MAX_WAIT,
  supervisorPool: 0,
  configured: false,
};

export type SavedBonus = {
  points: number;
  amount: number;
  gateApplied: boolean;
  savedAt: string;
  poolAmount: number;
  supervisorPoints: number | null;
  supervisorAmount: number | null;
};

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
  let dueDays = 0;
  for (let d = start; d <= lastDue; d = addDays(d, 1)) dueDays++;

  const [configRes, savedRes, closingsRes, surveysRes, auditsRes, receiptsRes, authorizationsRes] = await Promise.all([
    supabase
      .from("lodging_bonus_config")
      .select("pool_amount,weights,survey_goal,survey_min_responses,inspection_max_wait_minutes,supervisor_pool_amount")
      .eq("business_unit_id", unit.id)
      .maybeSingle(),
    supabase
      .from("lodging_bonus_results")
      .select("points,amount,gate_applied,saved_at,pool_amount,supervisor_points,supervisor_amount")
      .eq("business_unit_id", unit.id)
      .eq("month", start)
      .maybeSingle(),
    supabase
      .from("lodging_daily_closings")
      .select("closing_date,first_issued_at,issued_at")
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
    // Controles de supervisión: auditorías semanales, comprobantes con diferencia y cierres corregidos.
    supabase
      .from("lodging_supervisor_audits")
      .select("status")
      .eq("business_unit_id", unit.id)
      .gte("week_start", start)
      .lte("week_start", reference),
    supabase
      .from("lodging_payment_receipts")
      .select("id,ai_reviewed_at,lodging_reservation_payments!inner(status)")
      .eq("business_unit_id", unit.id)
      .eq("ai_review_status", "mismatch")
      .is("deleted_at", null)
      .eq("lodging_reservation_payments.status", "confirmed")
      .gte("created_at", `${start}T00:00:00-06:00`)
      .lt("created_at", `${addDays(reference, 1)}T06:00:00Z`),
    supabase
      .from("lodging_closing_authorizations")
      .select("closing_date")
      .eq("business_unit_id", unit.id)
      .eq("status", "approved")
      .gte("closing_date", start)
      .lte("closing_date", lastDue),
  ]);
  for (const r of [configRes, closingsRes, surveysRes]) if (r.error) throw r.error;

  const c = configRes.data;
  const config: BonusConfig = c
    ? {
        pool: Number(c.pool_amount),
        weights: { ...DEFAULT_BONUS_WEIGHTS, ...(c.weights as Partial<BonusWeights>) },
        surveyGoal: Number(c.survey_goal),
        surveyMinResponses: Number(c.survey_min_responses),
        inspectionMaxWait: Number(c.inspection_max_wait_minutes),
        supervisorPool: Number(c.supervisor_pool_amount),
        configured: true,
      }
    : defaultConfig;

  const surveys = (surveysRes.data ?? []).filter((s) => {
    const day = santiagoDay(s.created_at);
    return day >= start && day <= reference;
  });
  const surveyAvg = surveys.length
    ? surveys.reduce((sum, s) => sum + (s.cleanliness + s.comfort + s.staff + s.value_for_money) / 4, 0) / surveys.length
    : null;
  const latestReview = [...h.reviews].sort((a, b) => b.recorded_on.localeCompare(a.recorded_on))[0] ?? null;

  // Cierres: cada día vencido debe haberse emitido por primera vez antes de que terminara su día de trabajo.
  const firstIssued = new Map((closingsRes.data ?? []).map((c) => [c.closing_date, c.first_issued_at as string | null]));
  const lateDays: number[] = [];
  let onTimeClosings = 0;
  for (let d = start; d <= lastDue; d = addDays(d, 1)) {
    const issuedAt = firstIssued.get(d) ?? null;
    if (issuedAt !== null && new Date(issuedAt).getTime() < closingDeadline(d).getTime()) onTimeClosings++;
    else lateDays.push(Number(d.slice(8)));
  }
  // Saldos: estadías ya terminadas con deuda, sin contar las de empresa que paga después.
  const unpaid = h.balances.rows.filter((r) => !r.postpaid_company && r.check_out <= lastDue);
  const unpaidTotal = unpaid.reduce((sum, r) => sum + r.balance, 0);

  const insp = h.inspections;
  const input: BonusInput = {
    pool: config.pool,
    weights: config.weights,
    occupancy: { value: cappedOccupancyPct(h.month.days, h.month.totalRooms), goal: h.goals.occupancyPct },
    adr: { value: h.month.nightsSold ? h.month.adr : null, goal: h.goals.averageRate },
    booking: {
      value: latestReview ? latestReview.score : null,
      goal: h.goals.bookingScore,
    },
    survey: { value: surveyAvg, goal: config.surveyGoal, responses: surveys.length, minResponses: config.surveyMinResponses },
    inspections: {
      cleanings: insp.available && insp.enabled ? insp.cleanings : null,
      inspected: insp.available ? insp.inspectedCleanings : 0,
      avgWaitMinutes: insp.available ? insp.avgWaitMinutes : null,
      maxWaitMinutes: config.inspectionMaxWait,
    },
    order: {
      closings: dueDays > 0 ? { due: dueDays, onTime: onTimeClosings, lateDays } : null,
      balances: { count: unpaid.length, total: unpaidTotal },
    },
  };
  const result = computeBonus(input);

  // Bono del supervisor: 60% el resultado de la recepción y cuatro controles de cumple o no cumple.
  const staleCut = Date.now() - RECEIPT_RESOLVE_HOURS * 3_600_000;
  const correctedDays = new Set<string>();
  for (const c of closingsRes.data ?? []) {
    if (c.first_issued_at && c.issued_at && new Date(c.issued_at).getTime() - new Date(c.first_issued_at).getTime() > 60_000)
      correctedDays.add(c.closing_date);
  }
  for (const a of authorizationsRes.data ?? []) correctedDays.add(a.closing_date);
  const supervisorInput: SupervisorInput = {
    pool: config.supervisorPool,
    receptionPoints: result.points,
    audits: auditsRes.error
      ? null
      : {
          assigned: (auditsRes.data ?? []).length,
          completed: (auditsRes.data ?? []).filter((a) => a.status === "passed" || a.status === "failed").length,
        },
    receipts: receiptsRes.error
      ? null
      : {
          overdue: (receiptsRes.data ?? []).filter((r) => r.ai_reviewed_at && new Date(r.ai_reviewed_at).getTime() <= staleCut).length,
        },
    closings: closingsRes.error
      ? null
      : {
          total: (closingsRes.data ?? []).length,
          corrected: [...correctedDays].filter((d) => (closingsRes.data ?? []).some((c) => c.closing_date === d)).length,
          correctedDays: [...correctedDays]
            .filter((d) => (closingsRes.data ?? []).some((c) => c.closing_date === d))
            .map((d) => Number(d.slice(8)))
            .sort((a, b) => a - b),
        },
    booking: { value: latestReview ? latestReview.score : null, goal: h.goals.bookingScore },
  };
  const supervisor = { input: supervisorInput, result: computeSupervisorBonus(supervisorInput) };
  const saved: SavedBonus | null = savedRes.data
    ? {
        points: Number(savedRes.data.points),
        amount: Number(savedRes.data.amount),
        gateApplied: savedRes.data.gate_applied,
        savedAt: savedRes.data.saved_at,
        poolAmount: Number(savedRes.data.pool_amount),
        supervisorPoints: savedRes.data.supervisor_points === null ? null : Number(savedRes.data.supervisor_points),
        supervisorAmount: savedRes.data.supervisor_amount === null ? null : Number(savedRes.data.supervisor_amount),
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
    result,
    supervisor,
    saved,
    counts: { dueDays, surveyResponses: surveys.length },
  };
}

export type UnitBonus = Awaited<ReturnType<typeof loadUnit>>;
