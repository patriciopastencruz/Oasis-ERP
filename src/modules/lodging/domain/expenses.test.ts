import { describe, expect, it } from "vitest";
import { expenseFormSchema, monthBounds, parseExpenseAmount, shiftMonth, summarizeExpenses, type ExpenseRow } from "./expenses";

const row = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: "1",
  expense_date: "2026-10-05",
  category_id: "c1",
  category: "Luz",
  section: "fixed",
  description: "Cuenta de luz",
  supplier: null,
  document_number: null,
  amount: 45_000,
  payment_method: "transfer",
  created_at: "2026-10-05T15:00:00Z",
  created_by: "u1",
  voided_at: null,
  void_reason: null,
  ...over,
});

describe("gastos del hostal", () => {
  it("lee montos con o sin puntos y rechaza lo demás", () => {
    expect(parseExpenseAmount("45000")).toBe(45000);
    expect(parseExpenseAmount("45.000")).toBe(45000);
    expect(parseExpenseAmount("$ 1.250.000")).toBe(1250000);
    expect(parseExpenseAmount("0")).toBeNull();
    expect(parseExpenseAmount("-500")).toBeNull();
    expect(parseExpenseAmount("12,5")).toBeNull();
    expect(parseExpenseAmount("abc")).toBeNull();
    expect(parseExpenseAmount("")).toBeNull();
    expect(parseExpenseAmount("100.000.001")).toBeNull();
  });

  it("resume por tipo de gasto sin contar los anulados", () => {
    const s = summarizeExpenses([
      row({ id: "1", amount: 45_000 }),
      row({ id: "2", category_id: "c2", category: "Agua", amount: 20_000, payment_method: "cash" }),
      row({ id: "3", category_id: "c2", category: "Agua", amount: 10_000, payment_method: "cash" }),
      row({ id: "4", amount: 99_000, voided_at: "2026-10-06T10:00:00Z", void_reason: "Duplicado" }),
    ]);
    expect(s.total).toBe(75_000);
    expect(s.count).toBe(3);
    expect(s.voided).toBe(1);
    expect(s.categories.map((c) => [c.category, c.total, c.count])).toEqual([
      ["Luz", 45_000, 1],
      ["Agua", 30_000, 2],
    ]);
    expect(s.categories[0].share).toBeCloseTo(0.6);
    expect(s.methods).toEqual([
      { method: "transfer", amount: 45_000 },
      { method: "cash", amount: 30_000 },
    ]);
  });

  it("sin gastos todo queda en cero", () => {
    const s = summarizeExpenses([]);
    expect(s).toMatchObject({ total: 0, count: 0, categories: [], methods: [] });
  });

  it("calcula los límites del mes", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", next: "2026-11-01" });
  });

  it("valida el formulario", () => {
    const ok = {
      unit_id: "f32e6473-1a3e-4704-9581-b7dd436d846d",
      month: "2026-10",
      expense_date: "2026-10-05",
      category_id: "0ac96abe-b70c-482b-a14e-d55d661d2b32",
      description: "Cuenta de luz",
      payment_method: "transfer",
    };
    expect(expenseFormSchema.safeParse(ok).success).toBe(true);
    expect(expenseFormSchema.safeParse({ ...ok, description: " " }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...ok, payment_method: "bitcoin" }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...ok, category_id: "no-uuid" }).success).toBe(false);
  });
});
