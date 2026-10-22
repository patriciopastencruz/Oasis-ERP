import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monthBounds, type ExpenseRow } from "../domain/expenses";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ExpenseCategory = { id: string; name: string; section: string };

/** Tipos de gasto disponibles del hostal, agrupados por sección y orden del catálogo. */
export async function loadExpenseCategories(supabase: Supabase, unitId: string): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from("lodging_finance_categories")
    .select("id,name,section,sort_order")
    .eq("business_unit_id", unitId)
    .eq("active", true)
    .eq("allow_expenses", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, section: c.section }));
}

/** Gastos del mes (también los anulados, para dejar la huella), del más reciente al más antiguo. */
export async function loadMonthExpenses(supabase: Supabase, unitId: string, month: string) {
  const { start, next } = monthBounds(month);
  const { data, error } = await supabase
    .from("lodging_expenses")
    .select("id,expense_date,category_id,description,supplier,document_number,amount,payment_method,created_at,created_by,receipt_path,receipt_name,voided_at,void_reason,lodging_finance_categories(name,section)")
    .eq("business_unit_id", unitId)
    .gte("expense_date", start)
    .lt("expense_date", next)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const rows: ExpenseRow[] = (data ?? []).map((e) => {
    const cat = Array.isArray(e.lodging_finance_categories) ? e.lodging_finance_categories[0] : e.lodging_finance_categories;
    return {
      id: e.id,
      expense_date: e.expense_date,
      category_id: e.category_id,
      category: cat?.name ?? null,
      section: cat?.section ?? null,
      description: e.description,
      supplier: e.supplier,
      document_number: e.document_number,
      amount: Number(e.amount),
      payment_method: e.payment_method,
      created_at: e.created_at,
      created_by: e.created_by,
      receipt_path: e.receipt_path,
      receipt_name: e.receipt_name,
      voided_at: e.voided_at,
      void_reason: e.void_reason,
    };
  });
  return rows;
}
