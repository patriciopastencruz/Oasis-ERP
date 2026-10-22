import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadOperationsSource } from "./monthly-queries";
import { addDays, santiagoToday } from "../domain/daily-closing";
import { rangeOperations } from "../domain/monthly-closing";
import { dayOverDay } from "../domain/day-over-day";
import { pendingBalances, pendingClosingDates } from "../domain/group-weekly-report";
import type { ReviewScoreRow } from "../domain/review-scores";
import { goalsFromRow } from "../domain/report-goals";
import type { OpsKpis } from "../domain/ops-kpis";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Unit = { id: string; code: string; name: string };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Reporte semanal de todos los hostales del usuario (RLS limita a los suyos).
 * Todo es el acumulado del mes: del 1 al día de referencia (fecha de corte).
 */
export async function loadGroupWeeklyReport(supabase: Supabase, units: Unit[], reference: string, workingDay = santiagoToday()) {
  const today = santiagoToday();
  const monthStart = `${reference.slice(0, 7)}-01`;
  const hostels = await Promise.all(units.map((u) => loadHostel(supabase, u, monthStart, reference, today, workingDay)));
  return { reference, monthStart, hostels };
}

async function loadHostel(supabase: Supabase, unit: Unit, monthStart: string, reference: string, today: string, workingDay: string) {
  const from = monthStart;
  const dayAfter = addDays(reference, 1);
  const [src, closings, stays, reviews, goals, kpis, housekeeping, pendingRooms] = await Promise.all([
    // Un día antes del 1 para poder comparar el primer día del mes con ayer.
    loadOperationsSource(supabase, unit.id, addDays(from, -1), dayAfter),
    supabase
      .from("lodging_daily_closings")
      .select("closing_date")
      .eq("business_unit_id", unit.id)
      .eq("status", "issued")
      .gte("closing_date", from)
      .lte("closing_date", reference),
    // Estadías del mes ya iniciadas, con sus pagos, para el saldo por cobrar.
    supabase
      .from("lodging_reservations")
      .select("id,check_in,check_out,total_value,postpaid_company,lodging_rooms(name),lodging_guests(full_name),lodging_reservation_payments(amount,type,status)")
      .eq("business_unit_id", unit.id)
      .not("status", "in", "(cancelled,conflict)")
      .neq("origin", "maintenance")
      .lte("check_in", reference)
      .gt("check_out", monthStart),
    supabase
      .from("lodging_review_scores")
      .select("recorded_on,score,review_count,categories")
      .eq("business_unit_id", unit.id)
      .eq("source", "booking")
      .lte("recorded_on", reference)
      .order("recorded_on", { ascending: false })
      .limit(8),
    supabase
      .from("lodging_report_goals")
      .select("occupancy_pct,average_rate,revpar,booking_score,booking_categories")
      .eq("business_unit_id", unit.id)
      .maybeSingle(),
    // Inspecciones del mes (solo quien ve los indicadores de operación).
    supabase.rpc("lodging_ops_kpis", { target_unit: unit.id, from_date: monthStart, to_date: reference }),
    supabase.rpc("lodging_ops_housekeeping_enabled", { target_unit: unit.id }),
    supabase
      .from("lodging_rooms")
      .select("id", { count: "exact", head: true })
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .eq("operational_status", "pending_inspection"),
  ]);
  for (const r of [closings, stays, reviews, goals]) if (r.error) throw r.error;

  const month = rangeOperations(monthStart, reference, src.rooms, src.reservations, src.payments, today, src.gaps);
  // Variación de la venta promedio y el RevPAR contra el día anterior al corte.
  const yesterday = addDays(reference, -1);
  const yesterdayOps = rangeOperations(yesterday, yesterday, src.rooms, src.reservations, src.payments, today, src.gaps);
  const cumulativeBefore =
    yesterday >= monthStart
      ? rangeOperations(monthStart, yesterday, src.rooms, src.reservations, src.payments, today, src.gaps)
      : null;
  const dayCompare = dayOverDay({
    today: month.days.at(-1),
    yesterday: yesterdayOps.days[0],
    totalRooms: month.totalRooms,
    cumulativeNow: { adr: month.soldNights ? month.adr : null, revpar: month.revpar },
    cumulativeBefore: cumulativeBefore
      ? { adr: cumulativeBefore.soldNights ? cumulativeBefore.adr : null, revpar: cumulativeBefore.revpar }
      : null,
  });
  const reviewRows: ReviewScoreRow[] = (reviews.data ?? []).map((r) => ({
    recorded_on: r.recorded_on,
    score: Number(r.score),
    review_count: Number(r.review_count),
    categories: (r.categories ?? {}) as ReviewScoreRow["categories"],
  }));

  return {
    unit,
    month,
    dayCompare,
    reviews: reviewRows,
    goals: goalsFromRow(goals.data),
    inspections: inspectionSummary(kpis.error ? null : (kpis.data as OpsKpis | null), housekeeping.data !== false, pendingRooms.count ?? 0),
    pendingClosings: pendingClosingDates(
      monthStart,
      reference,
      (closings.data ?? []).map((c) => c.closing_date),
      workingDay,
    ),
    balances: pendingBalances(
      (stays.data ?? []).map((s) => ({
        id: s.id,
        room: one(s.lodging_rooms as { name: string } | { name: string }[] | null)?.name ?? "—",
        guest: one(s.lodging_guests as { full_name: string | null } | { full_name: string | null }[] | null)?.full_name ?? null,
        check_in: s.check_in,
        check_out: s.check_out,
        total_value: Number(s.total_value ?? 0),
        postpaid_company: !!s.postpaid_company,
        payments: (s.lodging_reservation_payments ?? []).map((p) => ({ amount: Number(p.amount), type: p.type, status: p.status })),
      })),
    ),
  };
}

/** Inspecciones del mes; `null` si el usuario no ve los indicadores de operación. */
function inspectionSummary(k: OpsKpis | null, enabled: boolean, pendingNow: number) {
  if (!k) return { available: false as const, enabled, pendingNow };
  return {
    available: true as const,
    enabled,
    pendingNow,
    cleanings: k.totals.cleanings,
    inspectedCleanings: k.totals.inspected,
    inspections: k.inspections.total,
    approved: k.inspections.approved,
    rejected: k.inspections.rejected,
    approvedFirstPct: k.totals.first_attempt ? Math.round((k.totals.approved_first / k.totals.first_attempt) * 100) : null,
    avgWaitMinutes: k.totals.avg_wait_minutes,
  };
}

export type GroupWeeklyReport = Awaited<ReturnType<typeof loadGroupWeeklyReport>>;
export type HostelWeekly = GroupWeeklyReport["hostels"][number];
