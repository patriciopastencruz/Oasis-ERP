import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadOperationsSource } from "./monthly-queries";
import { addDays, periodRange, shiftPeriod, type PeriodKind } from "../domain/daily-closing";
import { rangeOperations } from "../domain/monthly-closing";
import { buildPeriodReport } from "../domain/period-report";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Reporte semanal o quincenal: operación desde reservas y pagos + cierres diarios emitidos. */
export async function loadPeriodReport(supabase: Supabase, unitId: string, kind: PeriodKind, reference: string) {
  const range = periodRange(kind, reference);
  const prevRange = periodRange(kind, shiftPeriod(kind, reference, -1));
  const [src, closings] = await Promise.all([
    loadOperationsSource(supabase, unitId, prevRange.start, addDays(range.end, 1)),
    supabase
      .from("lodging_daily_closings")
      .select("id,closing_date,total_received,expense_total,pending_amount,reported_problems,items_to_replenish,metrics")
      .eq("business_unit_id", unitId)
      .eq("status", "issued")
      .gte("closing_date", range.start)
      .lte("closing_date", range.end)
      .order("closing_date"),
  ]);
  if (closings.error) throw closings.error;
  const ids = (closings.data ?? []).map((c) => c.id);
  const { data: expenses, error } = ids.length
    ? await supabase
        .from("lodging_daily_closing_expenses")
        .select("amount,lodging_finance_categories(name)")
        .in("closing_id", ids)
        .is("deleted_at", null)
    : { data: [], error: null };
  if (error) throw error;
  const ops = rangeOperations(range.start, range.end, src.rooms, src.reservations, src.payments);
  const previousOps = rangeOperations(prevRange.start, prevRange.end, src.rooms, src.reservations, src.payments);
  return buildPeriodReport({
    kind,
    range,
    ops,
    previousOps,
    closings: (closings.data ?? []).map((c) => ({
      ...c,
      total_received: Number(c.total_received),
      expense_total: Number(c.expense_total),
      pending_amount: Number(c.pending_amount),
    })),
    expenses: (expenses ?? []).map((e) => {
      const cat = Array.isArray(e.lodging_finance_categories) ? e.lodging_finance_categories[0] : e.lodging_finance_categories;
      return { amount: Number(e.amount), category_name: (cat as { name?: string } | null)?.name ?? null };
    }),
  });
}
