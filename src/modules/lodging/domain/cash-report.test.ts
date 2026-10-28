import { describe, expect, it } from "vitest";
import { buildCashReport, cashMonthRange, type CashPaymentRow } from "./cash-report";

const row = (over: Partial<CashPaymentRow>): CashPaymentRow => ({
  id: "p",
  paid_at: "2026-10-05T15:00:00Z",
  type: "total",
  amount: 50000,
  notes: null,
  room: "101",
  guest: "Ana",
  origin: "direct",
  registered_by: "Alina",
  ...over,
});

describe("buildCashReport", () => {
  it("suma el efectivo del mes, resta reembolsos y agrupa por día de Santiago", () => {
    const report = buildCashReport("2026-10", [
      row({ id: "a", paid_at: "2026-10-05T15:00:00Z", amount: 50000 }),
      row({ id: "b", paid_at: "2026-10-05T20:00:00Z", amount: 30000 }),
      row({ id: "c", paid_at: "2026-10-07T15:00:00Z", amount: 10000, type: "refund" }),
    ]);
    expect(report.days.map((d) => [d.day, d.total])).toEqual([["2026-10-05", 80000], ["2026-10-07", -10000]]);
    expect(report).toMatchObject({ total: 70000, collected: 80000, refunded: 10000, count: 3 });
  });

  it("deja fuera lo que por huso horario cae en otro mes", () => {
    // 01:00 UTC del 1 de noviembre = 22:00 (o 21:00) del 31 de octubre en Santiago.
    const report = buildCashReport("2026-11", [row({ paid_at: "2026-11-01T01:00:00Z" })]);
    expect(report.count).toBe(0);
    expect(buildCashReport("2026-10", [row({ paid_at: "2026-11-01T01:00:00Z" })]).count).toBe(1);
  });

  it("informa los pagos anulados sin sumarlos", () => {
    const report = buildCashReport("2026-10", [row({})], [{ amount: 20000 }, { amount: 5000 }]);
    expect(report).toMatchObject({ total: 50000, voidedCount: 2, voidedTotal: 25000 });
  });
});

describe("cashMonthRange", () => {
  it("cubre diciembre hasta enero", () => {
    expect(cashMonthRange("2026-12")).toEqual({ from: "2026-12-01", toExclusive: "2027-01-01" });
  });
});
