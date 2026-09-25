import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  monthRange,
  type CashFlowClosing,
  type CashFlowEntry,
  type CashFlowKind,
  type PaymentMethod,
} from "../domain/cash-flow";

/**
 * Resuelve la unidad activa con el mismo criterio del layout (app-shell):
 * la guardada en la cookie dentro de la compañía activa, si no Oasis
 * Modulares, y si no la primera por nombre.
 */
export async function cashFlowContext(permission = "finance.cash_flow.view") {
  const ctx = await requirePermission(permission);
  const store = await cookies();
  const company =
    ctx.companies.find((c) => c.id === store.get("oasis_company")?.value) ??
    ctx.companies[0];
  const units = ctx.units.filter((u) => u.company_id === company?.id);
  const unit =
    units.find((u) => u.id === store.get("oasis_unit")?.value) ??
    units.find((u) => u.code === "OM") ??
    [...units].sort((a, b) => a.name.localeCompare(b.name, "es"))[0];
  if (!unit) redirect("/no-access");
  return {
    ctx,
    unit,
    canRecord: ctx.permissions.has("finance.cash_flow.record"),
    canManage: ctx.permissions.has("finance.cash_flow.manage"),
    supabase: await createSupabaseServerClient(),
  };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CashFlowCategory = {
  id: string;
  kind: CashFlowKind;
  name: string;
  active: boolean;
  sort_order: number;
};

export async function listCategories(supabase: Supabase, unitId: string) {
  const { data, error } = await supabase
    .from("cash_flow_categories")
    .select("id,kind,name,active,sort_order")
    .eq("business_unit_id", unitId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as CashFlowCategory[];
}

type EntryRow = {
  id: string;
  entry_date: string;
  kind: CashFlowKind;
  amount: number;
  payment_method: PaymentMethod;
  category_id: string;
  description: string;
  reference: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  cash_flow_categories: { name: string } | { name: string }[] | null;
  creator: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

function mapEntry(row: EntryRow) {
  const creator = one(row.creator);
  return {
    ...row,
    amount: Number(row.amount),
    category_name: one(row.cash_flow_categories)?.name ?? "Sin categoría",
    created_by_name: creator ? `${creator.first_name} ${creator.last_name}` : "",
  };
}
export type CashFlowEntryDetail = ReturnType<typeof mapEntry>;

const entryColumns =
  "id,entry_date,kind,amount,payment_method,category_id,description,reference,created_at,voided_at,void_reason,cash_flow_categories(name),creator:profiles!cash_flow_entries_created_by_fkey(first_name,last_name)";

export type CashFlowClosingDetail = {
  id: string;
  closing_date: string;
  status: "closed" | "reopened";
  total_income: number;
  total_expense: number;
  net_result: number;
  cash_income: number;
  cash_expense: number;
  opening_cash: number;
  expected_cash: number;
  counted_cash: number | null;
  cash_difference: number | null;
  entries_count: number;
  notes: string | null;
  closed_at: string;
  reopened_at: string | null;
  reopen_reason: string | null;
};

export async function loadDay(supabase: Supabase, unitId: string, day: string) {
  const [entries, closing, previous] = await Promise.all([
    supabase
      .from("cash_flow_entries")
      .select(entryColumns)
      .eq("business_unit_id", unitId)
      .eq("entry_date", day)
      .order("created_at"),
    supabase
      .from("cash_flow_daily_closings")
      .select("*")
      .eq("business_unit_id", unitId)
      .eq("closing_date", day)
      .maybeSingle(),
    // El efectivo contado del último cierre anterior sugiere el fondo inicial.
    supabase
      .from("cash_flow_daily_closings")
      .select("closing_date,counted_cash,expected_cash")
      .eq("business_unit_id", unitId)
      .eq("status", "closed")
      .lt("closing_date", day)
      .order("closing_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (entries.error) throw entries.error;
  if (closing.error) throw closing.error;
  const rows = ((entries.data ?? []) as unknown as EntryRow[]).map(mapEntry);
  const prev = previous.data;
  return {
    entries: rows,
    closing: (closing.data ?? null) as CashFlowClosingDetail | null,
    suggestedOpeningCash: prev ? Number(prev.counted_cash ?? prev.expected_cash ?? 0) : 0,
  };
}

export async function loadMonth(supabase: Supabase, unitId: string, month: string) {
  const { start, end } = monthRange(month);
  const [entries, closings] = await Promise.all([
    supabase
      .from("cash_flow_entries")
      .select(entryColumns)
      .eq("business_unit_id", unitId)
      .is("voided_at", null)
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("entry_date")
      .order("created_at"),
    supabase
      .from("cash_flow_daily_closings")
      .select("closing_date,status")
      .eq("business_unit_id", unitId)
      .gte("closing_date", start)
      .lte("closing_date", end),
  ]);
  if (entries.error) throw entries.error;
  if (closings.error) throw closings.error;
  return {
    entries: ((entries.data ?? []) as unknown as EntryRow[]).map(mapEntry),
    closings: (closings.data ?? []) as CashFlowClosing[],
  };
}

export type { CashFlowEntry };
