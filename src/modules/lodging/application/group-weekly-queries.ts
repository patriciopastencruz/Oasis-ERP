import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadOperationsSource } from "./monthly-queries";
import { addDays, periodRange, santiagoToday } from "../domain/daily-closing";
import { rangeOperations } from "../domain/monthly-closing";
import { pendingBalances, pendingClosingDates, staffActivity } from "../domain/group-weekly-report";
import type { ReviewScoreRow } from "../domain/review-scores";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Unit = { id: string; code: string; name: string };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Reporte semanal de todos los hostales del usuario (RLS limita a los suyos).
 * Mes = del 1 al día de referencia; semana = lunes a domingo que contiene la
 * referencia, recortada a la referencia.
 */
export async function loadGroupWeeklyReport(supabase: Supabase, units: Unit[], reference: string) {
  const today = santiagoToday();
  const monthStart = `${reference.slice(0, 7)}-01`;
  const week = periodRange("week", reference);
  const weekEnd = week.end < reference ? week.end : reference;
  const hostels = await Promise.all(units.map((u) => loadHostel(supabase, u, monthStart, week.start, weekEnd, reference, today)));
  return { reference, monthStart, week: { start: week.start, end: weekEnd }, hostels };
}

async function loadHostel(supabase: Supabase, unit: Unit, monthStart: string, weekStart: string, weekEnd: string, reference: string, today: string) {
  const from = weekStart < monthStart ? weekStart : monthStart;
  const dayAfter = addDays(reference, 1);
  const [src, closings, stays, reviews, created, payments] = await Promise.all([
    loadOperationsSource(supabase, unit.id, from, dayAfter),
    supabase
      .from("lodging_daily_closings")
      .select("closing_date,issued_by")
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
      .from("lodging_reservations")
      .select("created_by,created_at")
      .eq("business_unit_id", unit.id)
      .eq("imported_from_ical", false)
      .gte("created_at", `${weekStart}T00:00:00-06:00`)
      .lt("created_at", `${addDays(weekEnd, 1)}T06:00:00Z`),
    supabase
      .from("lodging_reservation_payments")
      .select("registered_by,amount,type,paid_at")
      .eq("business_unit_id", unit.id)
      .eq("status", "confirmed")
      .gte("paid_at", `${weekStart}T00:00:00-06:00`)
      .lt("paid_at", `${addDays(weekEnd, 1)}T06:00:00Z`),
  ]);
  for (const r of [closings, stays, reviews, created, payments]) if (r.error) throw r.error;

  const santiagoDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));
  const weekPayments = (payments.data ?? []).filter((p) => {
    const d = santiagoDate(p.paid_at);
    return d >= weekStart && d <= weekEnd;
  });
  const weekCreated = (created.data ?? []).filter((r) => {
    const d = santiagoDate(r.created_at);
    return d >= weekStart && d <= weekEnd;
  });
  const weekClosings = (closings.data ?? []).filter((c) => c.closing_date >= weekStart && c.closing_date <= weekEnd);
  const userIds = [
    ...new Set(
      [...weekCreated.map((r) => r.created_by), ...weekPayments.map((p) => p.registered_by), ...weekClosings.map((c) => c.issued_by)].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id,first_name,last_name").in("id", userIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
  const names = new Map((people ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Usuario"]));

  const month = rangeOperations(monthStart, reference, src.rooms, src.reservations, src.payments, today);
  const weekOps = rangeOperations(weekStart, weekEnd, src.rooms, src.reservations, src.payments, today);
  const reviewRows: ReviewScoreRow[] = (reviews.data ?? []).map((r) => ({
    recorded_on: r.recorded_on,
    score: Number(r.score),
    review_count: Number(r.review_count),
    categories: (r.categories ?? {}) as ReviewScoreRow["categories"],
  }));

  return {
    unit,
    month,
    week: weekOps,
    reviews: reviewRows,
    pendingClosings: pendingClosingDates(
      monthStart,
      reference,
      (closings.data ?? []).map((c) => c.closing_date),
      today,
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
    staff: staffActivity({
      names,
      reservations: weekCreated,
      payments: weekPayments.map((p) => ({ registered_by: p.registered_by, amount: Number(p.amount), type: p.type })),
      closings: weekClosings,
    }),
  };
}

export type GroupWeeklyReport = Awaited<ReturnType<typeof loadGroupWeeklyReport>>;
export type HostelWeekly = GroupWeeklyReport["hostels"][number];
