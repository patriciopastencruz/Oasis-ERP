import { describe, expect, it } from "vitest";
import {
  chileToday,
  monthRange,
  resolveDay,
  resolveMonth,
  shiftMonth,
  summarizeMonth,
  type CashFlowEntry,
} from "./cash-flow";

const entry = (
  partial: Partial<CashFlowEntry> & Pick<CashFlowEntry, "entry_date" | "kind" | "amount">,
): CashFlowEntry => ({
  id: crypto.randomUUID(),
  payment_method: "cash",
  category_id: partial.kind === "income" ? "cat-in" : "cat-out",
  category_name: partial.kind === "income" ? "Ventas" : "Compras",
  ...partial,
});

describe("fechas del flujo de caja", () => {
  it("usa la fecha de Santiago y no la UTC", () => {
    // 02:00 UTC del 1 de julio = 22:00 del 30 de junio en Chile (UTC-4).
    expect(chileToday(new Date("2026-07-01T02:00:00Z"))).toBe("2026-06-30");
  });

  it("rechaza fechas inválidas o futuras", () => {
    expect(resolveDay("2026-09-10", "2026-09-25")).toBe("2026-09-10");
    expect(resolveDay("2026-02-30", "2026-09-25")).toBe("2026-09-25");
    expect(resolveDay("2026-10-01", "2026-09-25")).toBe("2026-09-25");
    expect(resolveDay("hola", "2026-09-25")).toBe("2026-09-25");
    expect(resolveMonth("2026-13", "2026-09-25")).toBe("2026-09");
    expect(resolveMonth("2026-12", "2026-09-25")).toBe("2026-09");
    expect(resolveMonth("2026-08", "2026-09-25")).toBe("2026-08");
  });

  it("calcula rangos de mes, incluidos febrero y cambio de año", () => {
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("caja mensual", () => {
  const entries = [
    entry({ entry_date: "2026-08-01", kind: "income", amount: 100000 }),
    entry({ entry_date: "2026-08-01", kind: "expense", amount: 30000 }),
    entry({ entry_date: "2026-08-02", kind: "income", amount: 50000, payment_method: "transfer" }),
    entry({
      entry_date: "2026-08-02",
      kind: "expense",
      amount: 10000,
      category_id: "cat-fuel",
      category_name: "Combustible",
    }),
  ];

  it("totaliza ingresos, gastos, utilidad y margen", () => {
    const summary = summarizeMonth("2026-08", entries, [], "2026-09-25");
    expect(summary.totals).toEqual({
      income: 150000,
      expense: 40000,
      net: 110000,
      margin: 110000 / 150000,
    });
  });

  it("detalla todos los días del mes con su estado de cierre", () => {
    const summary = summarizeMonth(
      "2026-08",
      entries,
      [{ closing_date: "2026-08-01", status: "closed" }],
      "2026-09-25",
    );
    expect(summary.days).toHaveLength(31);
    expect(summary.days[0]).toMatchObject({ income: 100000, expense: 30000, net: 70000, status: "closed" });
    expect(summary.days[1]).toMatchObject({ net: 40000, status: "open" });
    expect(summary.closedDays).toBe(1);
    expect(summary.pendingDays).toBe(1);
  });

  it("corta el mes en curso en el día de hoy", () => {
    const summary = summarizeMonth("2026-09", [], [], "2026-09-25");
    expect(summary.days).toHaveLength(25);
    expect(summary.totals.margin).toBeNull();
  });

  it("agrupa por categoría con participación y por medio de pago", () => {
    const summary = summarizeMonth("2026-08", entries, [], "2026-09-25");
    expect(summary.incomeCategories).toEqual([
      expect.objectContaining({ name: "Ventas", amount: 150000, share: 1 }),
    ]);
    expect(summary.expenseCategories.map((c) => [c.name, c.share])).toEqual([
      ["Compras", 0.75],
      ["Combustible", 0.25],
    ]);
    expect(summary.methods.map((m) => [m.method, m.net])).toEqual([
      ["cash", 60000],
      ["transfer", 50000],
    ]);
  });
});
