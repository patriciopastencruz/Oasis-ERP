import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  monthEnd,
  monthOperations,
  monthStart,
  nextMonth,
  previousMonth,
  type MonthlySummary,
} from "../domain/monthly-closing";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type MonthlyClosingRow = {
  id: string;
  period: string;
  status: "draft" | "closed";
  notes: string | null;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
};

async function summaryFor(supabase: Supabase, unitId: string, month: string) {
  const { data, error } = await supabase.rpc("lodging_monthly_summary", {
    target_unit: unitId,
    target_period: monthStart(month),
  });
  if (error) throw error;
  return data as MonthlySummary;
}

/** Habitaciones vendibles, reservas y pagos de un rango [from, toExclusive). */
export async function loadOperationsSource(supabase: Supabase, unitId: string, from: string, toExclusive: string) {
  const [rooms, reservations, payments] = await Promise.all([
    supabase
      .from("lodging_rooms")
      .select("id,name,room_type,display_order,status")
      .eq("business_unit_id", unitId)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("lodging_reservations")
      .select("room_id,check_in,check_out,total_value")
      .eq("business_unit_id", unitId)
      .not("status", "in", "(cancelled,conflict)")
      .neq("origin", "maintenance")
      .lt("check_in", toExclusive)
      .gt("check_out", from),
    supabase
      .from("lodging_reservation_payments")
      .select("paid_at,amount,type,payment_method")
      .eq("business_unit_id", unitId)
      .eq("status", "confirmed")
      // Margen por la diferencia horaria; el filtro exacto es por fecha de Santiago.
      .gte("paid_at", `${from}T00:00:00-06:00`)
      .lt("paid_at", `${toExclusive}T06:00:00Z`),
  ]);
  for (const r of [rooms, reservations, payments]) if (r.error) throw r.error;
  return {
    rooms: (rooms.data ?? []).filter((r) => !["out_of_service", "maintenance"].includes(r.status)),
    reservations: (reservations.data ?? []).map((r) => ({ ...r, total_value: Number(r.total_value) })),
    payments: (payments.data ?? []).map((p) => ({
      paid_at: p.paid_at,
      payment_method: p.payment_method,
      amount: p.type === "refund" ? -Number(p.amount) : Number(p.amount),
    })),
  };
}

async function operationsFor(supabase: Supabase, unitId: string, month: string) {
  const prev = previousMonth(month);
  const src = await loadOperationsSource(supabase, unitId, monthStart(prev), monthStart(nextMonth(month)));
  return {
    current: monthOperations(month, src.rooms, src.reservations, src.payments),
    previous: monthOperations(prev, src.rooms, src.reservations, src.payments, monthEnd(prev)),
  };
}

export async function loadMonthly(supabase: Supabase, unitId: string, month: string) {
  const prev = previousMonth(month);
  const [closing, summary, previousSummary, ops] = await Promise.all([
    supabase
      .from("lodging_monthly_closings")
      .select("id,period,status,notes,closed_at,reopened_at,reopen_reason")
      .eq("business_unit_id", unitId)
      .eq("period", monthStart(month))
      .maybeSingle(),
    summaryFor(supabase, unitId, month),
    summaryFor(supabase, unitId, prev),
    operationsFor(supabase, unitId, month),
  ]);
  if (closing.error) throw closing.error;
  // Solo se compara contra el mes anterior si tuvo cierre mensual.
  const { data: prevClosing } = await supabase
    .from("lodging_monthly_closings")
    .select("id")
    .eq("business_unit_id", unitId)
    .eq("period", monthStart(prev))
    .maybeSingle();
  return {
    closing: (closing.data ?? null) as MonthlyClosingRow | null,
    summary,
    previous: { summary: prevClosing ? previousSummary : null, ops: ops.previous },
    ops: ops.current,
  };
}
export type MonthlyData = Awaited<ReturnType<typeof loadMonthly>>;

export async function listFinanceCategories(supabase: Supabase, unitId: string) {
  const { data, error } = await supabase
    .from("lodging_finance_categories")
    .select("id,section,name,allow_daily,sort_order,active")
    .eq("business_unit_id", unitId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
