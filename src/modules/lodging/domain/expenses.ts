import { z } from "zod";

/** Hostales que tienen el ingreso de gastos (por ahora solo Hostal Uruguay). */
export const EXPENSE_UNIT_CODES = ["HU"];

export const expensePaymentLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  debit_card: "Tarjeta de débito",
  credit_card: "Tarjeta de crédito",
  other: "Otro",
} as const;
export type ExpensePayment = keyof typeof expensePaymentLabels;

/** Sección del estado de resultados a la que pertenece cada tipo de gasto. */
export const expenseSectionLabels: Record<string, string> = {
  fixed: "Costo fijo",
  variable: "Costo variable",
  investment: "Inversión",
  other: "Otro gasto",
};

/** Monto en pesos: acepta "45000", "45.000" o "$ 45.000"; devuelve un entero mayor que 0 o null. */
export function parseExpenseAmount(value: string | null | undefined) {
  const text = String(value ?? "").replace(/[$\s]/g, "").replace(/\./g, "");
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= 100_000_000 ? n : null;
}

export const expenseFormSchema = z.object({
  unit_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.string().uuid(),
  description: z.string().trim().min(2, "Describe el gasto.").max(200, "La descripción es muy larga."),
  supplier: z.string().trim().max(120).default(""),
  document_number: z.string().trim().max(60).default(""),
  payment_method: z.enum(["cash", "transfer", "debit_card", "credit_card", "other"]),
});

export type ExpenseRow = {
  id: string;
  expense_date: string;
  category_id: string;
  category: string;
  section: string;
  description: string;
  supplier: string | null;
  document_number: string | null;
  amount: number;
  payment_method: string;
  created_at: string;
  created_by: string;
  voided_at: string | null;
  void_reason: string | null;
};

/** Total del mes por tipo de gasto, de mayor a menor, sin contar los anulados. */
export function summarizeExpenses(rows: ExpenseRow[]) {
  const active = rows.filter((r) => !r.voided_at);
  const total = active.reduce((s, r) => s + r.amount, 0);
  const byCategory = new Map<string, { category: string; section: string; count: number; total: number }>();
  for (const r of active) {
    const c = byCategory.get(r.category_id) ?? { category: r.category, section: r.section, count: 0, total: 0 };
    c.count += 1;
    c.total += r.amount;
    byCategory.set(r.category_id, c);
  }
  const categories = [...byCategory.values()]
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "es"))
    .map((c) => ({ ...c, share: total ? c.total / total : 0 }));
  const byMethod = new Map<string, number>();
  for (const r of active) byMethod.set(r.payment_method, (byMethod.get(r.payment_method) ?? 0) + r.amount);
  return {
    total,
    count: active.length,
    voided: rows.length - active.length,
    categories,
    methods: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export const currentMonth = (today: string) => today.slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export function monthBounds(month: string) {
  const start = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  return { start, next };
}
