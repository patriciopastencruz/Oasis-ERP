import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClosingExpense, ClosingMetrics, DailyClosing } from "../domain/daily-closing";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const closingColumns =
  "id,closing_date,status,metrics,total_rooms,occupied_rooms,occupancy_pct,average_rate,cash_received,transfer_received,card_received,airbnb_received,other_received,total_received,pending_amount,expense_total,net_result,reported_problems,items_to_replenish,observations,issued_at,email_sent_at,email_recipients,business_unit_id,issuer:profiles!lodging_daily_closings_issued_by_fkey(first_name,last_name)";

type Row = DailyClosing & {
  business_unit_id: string;
  issuer: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

function toClosing(row: Row) {
  const issuer = Array.isArray(row.issuer) ? row.issuer[0] : row.issuer;
  const numeric = [
    "total_rooms",
    "occupied_rooms",
    "occupancy_pct",
    "average_rate",
    "cash_received",
    "transfer_received",
    "card_received",
    "airbnb_received",
    "other_received",
    "total_received",
    "pending_amount",
    "expense_total",
    "net_result",
  ] as const;
  const closing = { ...row } as DailyClosing & { business_unit_id: string };
  for (const key of numeric) closing[key] = Number(row[key] ?? 0);
  return {
    closing,
    issuedBy: issuer ? `${issuer.first_name} ${issuer.last_name}` : null,
  };
}

export async function loadClosing(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from("lodging_daily_closings")
    .select(closingColumns)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: expenses, error: expenseError } = await supabase
    .from("lodging_daily_closing_expenses")
    .select("description,amount,payment_method")
    .eq("closing_id", id)
    .is("deleted_at", null)
    .order("created_at");
  if (expenseError) throw expenseError;
  return {
    ...toClosing(data as unknown as Row),
    expenses: (expenses ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as ClosingExpense[],
  };
}

export async function findClosingId(supabase: Supabase, unitId: string, date: string) {
  const { data } = await supabase
    .from("lodging_daily_closings")
    .select("id")
    .eq("business_unit_id", unitId)
    .eq("closing_date", date)
    .maybeSingle();
  return data?.id as string | undefined;
}

export async function liveMetrics(supabase: Supabase, unitId: string, date: string) {
  const { data, error } = await supabase.rpc("lodging_closing_metrics", {
    target_unit: unitId,
    target_date: date,
  });
  if (error) throw error;
  return data as ClosingMetrics;
}

export async function loadIssuedClosings(
  supabase: Supabase,
  unitId: string,
  range: { start: string; end: string },
) {
  const { data, error } = await supabase
    .from("lodging_daily_closings")
    .select(closingColumns)
    .eq("business_unit_id", unitId)
    .eq("status", "issued")
    .gte("closing_date", range.start)
    .lte("closing_date", range.end)
    .order("closing_date");
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((row) => toClosing(row).closing);
}

export async function listRecentClosings(supabase: Supabase, unitId: string, limit = 15) {
  const { data, error } = await supabase
    .from("lodging_daily_closings")
    .select("id,closing_date,status,total_received,expense_total,occupancy_pct,email_sent_at")
    .eq("business_unit_id", unitId)
    .order("closing_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
