import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, defaultClosingDate, santiagoToday } from "../domain/daily-closing";
import { loadGroupWeeklyReport } from "./group-weekly-queries";
import { revparGoal } from "../domain/report-goals";
import {
  DEFAULT_BONUS_WEIGHTS,
  cappedOccupancyPct,
  computeBonus,
  type BonusInput,
  type BonusWeights,
} from "../domain/reception-bonus";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Unit = { id: string; code: string; name: string };

const santiagoDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);

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
  housekeepingGoal: number;
  configured: boolean;
};

const defaultConfig: BonusConfig = {
  pool: 0,
  weights: DEFAULT_BONUS_WEIGHTS,
  surveyGoal: 4.5,
  surveyMinResponses: 5,
  housekeepingGoal: 85,
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
  let dueDays = 0;
  for (let d = start; d <= lastDue; d = addDays(d, 1)) dueDays++;

  const [configRes, savedRes, reservationsRes, paymentsRes, surveysRes, previousBookingRes] = await Promise.all([
    supabase
      .from("lodging_bonus_config")
      .select("pool_amount,weights,survey_goal,survey_min_responses,housekeeping_goal")
      .eq("business_unit_id", unit.id)
      .maybeSingle(),
    supabase
      .from("lodging_bonus_results")
      .select("points,amount,gate_applied,saved_at,pool_amount")
      .eq("business_unit_id", unit.id)
      .eq("month", start)
      .maybeSingle(),
    supabase
      .from("lodging_reservations")
      .select("total_value")
      .eq("business_unit_id", unit.id)
      .not("status", "in", "(cancelled,conflict)")
      .neq("origin", "maintenance")
      .lte("check_in", reference)
      .gt("check_out", start),
    supabase
      .from("lodging_reservation_payments")
      .select("paid_at,type,payment_method,lodging_payment_receipts(id,deleted_at)")
      .eq("business_unit_id", unit.id)
      .eq("status", "confirmed")
      .in("payment_method", ["transfer", "card"])
      .gte("paid_at", `${start}T00:00:00-06:00`)
      .lt("paid_at", `${addDays(reference, 1)}T06:00:00Z`),
    supabase
      .from("lodging_satisfaction_surveys")
      .select("created_at,cleanliness,comfort,staff,value_for_money")
      .eq("business_unit_id", unit.id)
      .gte("created_at", `${start}T00:00:00-06:00`)
      .lt("created_at", `${addDays(reference, 1)}T06:00:00Z`),
    supabase
      .from("lodging_review_scores")
      .select("score")
      .eq("business_unit_id", unit.id)
      .eq("source", "booking")
      .lt("recorded_on", start)
      .order("recorded_on", { ascending: false })
      .limit(1),
  ]);
  for (const r of [configRes, reservationsRes, paymentsRes, surveysRes]) if (r.error) throw r.error;

  const c = configRes.data;
  const config: BonusConfig = c
    ? {
        pool: Number(c.pool_amount),
        weights: { ...DEFAULT_BONUS_WEIGHTS, ...(c.weights as Partial<BonusWeights>) },
        surveyGoal: Number(c.survey_goal),
        surveyMinResponses: Number(c.survey_min_responses),
        housekeepingGoal: Number(c.housekeeping_goal),
        configured: true,
      }
    : defaultConfig;

  const reservations = reservationsRes.data ?? [];
  const payments = (paymentsRes.data ?? []).filter((p) => {
    const day = santiagoDay(p.paid_at);
    return day >= start && day <= reference && p.type !== "refund";
  });
  const withReceipt = payments.filter((p) => {
    const list = Array.isArray(p.lodging_payment_receipts) ? p.lodging_payment_receipts : p.lodging_payment_receipts ? [p.lodging_payment_receipts] : [];
    return list.some((r) => !r.deleted_at);
  }).length;
  const surveys = (surveysRes.data ?? []).filter((s) => {
    const day = santiagoDay(s.created_at);
    return day >= start && day <= reference;
  });
  const surveyAvg = surveys.length
    ? surveys.reduce((sum, s) => sum + (s.cleanliness + s.comfort + s.staff + s.value_for_money) / 4, 0) / surveys.length
    : null;
  const latestReview = [...h.reviews].sort((a, b) => b.recorded_on.localeCompare(a.recorded_on))[0] ?? null;

  const insp = h.inspections;
  const input: BonusInput = {
    pool: config.pool,
    weights: config.weights,
    occupancy: { value: cappedOccupancyPct(h.month.days, h.month.totalRooms), goal: h.goals.occupancyPct },
    revpar: { value: h.month.totalRooms ? h.month.revpar : null, goal: revparGoal(h.goals) },
    booking: {
      value: latestReview ? latestReview.score : null,
      goal: h.goals.bookingScore,
      previous: previousBookingRes.data?.[0] ? Number(previousBookingRes.data[0].score) : null,
    },
    survey: { value: surveyAvg, goal: config.surveyGoal, responses: surveys.length, minResponses: config.surveyMinResponses },
    housekeeping: {
      value: insp.available && insp.enabled ? insp.approvedFirstPct : null,
      goal: config.housekeepingGoal,
    },
    order: {
      closings: pct(dueDays - h.pendingClosings.length, dueDays),
      prices: pct(reservations.filter((r) => Number(r.total_value) > 0).length, reservations.length),
      receipts: pct(withReceipt, payments.length),
    },
  };
  const result = computeBonus(input);
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
    result,
    saved,
    counts: {
      dueDays,
      pendingClosings: h.pendingClosings.length,
      reservations: reservations.length,
      payments: payments.length,
      paymentsWithReceipt: withReceipt,
      surveyResponses: surveys.length,
    },
  };
}

export type UnitBonus = Awaited<ReturnType<typeof loadUnit>>;
