import { describe, expect, it } from "vitest";
import { rangeOperations } from "./monthly-closing";
import { buildPeriodReport } from "./period-report";

const rooms = [
  { id: "r1", name: "Modular 2", room_type: "Modulares", display_order: 1 },
  { id: "r2", name: "Pieza 11", room_type: "Baño compartido", display_order: 2 },
];
// Semana lun 21 - dom 27 de septiembre de 2026.
const reservations = [
  { room_id: "r1", check_in: "2026-09-25", check_out: "2026-09-27", total_value: 60_000 }, // vie y sáb
  { room_id: "r2", check_in: "2026-09-22", check_out: "2026-09-23", total_value: 20_000 }, // mar
  { room_id: "r1", check_in: "2026-09-15", check_out: "2026-09-16", total_value: 30_000 }, // semana anterior
];
const payments = [
  { paid_at: "2026-09-25T15:00:00Z", amount: 60_000, payment_method: "transfer" },
  { paid_at: "2026-09-22T15:00:00Z", amount: 20_000, payment_method: "cash" },
  { paid_at: "2026-09-15T15:00:00Z", amount: 40_000, payment_method: "cash" },
];
const range = { start: "2026-09-21", end: "2026-09-27" };
const ops = rangeOperations(range.start, range.end, rooms, reservations, payments, "2026-10-01");
const prev = rangeOperations("2026-09-14", "2026-09-20", rooms, reservations, payments, "2026-10-01");

describe("reporte semanal", () => {
  const report = buildPeriodReport({
    kind: "week",
    range,
    ops,
    previousOps: prev,
    closings: [
      { closing_date: "2026-09-22", total_received: 20_000, expense_total: 5_000, pending_amount: 0, reported_problems: "Ducha", items_to_replenish: null, metrics: { arrivals: 1 } },
      { closing_date: "2026-09-25", total_received: 60_000, expense_total: 3_000, pending_amount: 7_000, reported_problems: null, items_to_replenish: "Toallas", metrics: { arrivals: 1, reservations_without_price: 0, pending: [{ room: "Modular 2", balance: 7_000 }] } },
    ],
    expenses: [
      { category_name: "Insumos y limpieza", amount: 5_000 },
      { category_name: null, amount: 3_000 },
    ],
  });

  it("calcula ingreso cobrado, gasto, resultado y comparaciones", () => {
    expect(report.income).toBe(80_000);
    expect(report.expenseTotal).toBe(8_000);
    expect(report.result).toBe(72_000);
    expect(report.deltas.income).toBe(100);
    expect(ops.nightsSold).toBe(3);
    expect(report.deltas.occupancyPts).toBeCloseTo((3 / 14 - 1 / 14) * 100);
  });

  it("identifica destacados y control del período", () => {
    expect(report.best?.label).toBe("Vie 25");
    expect(report.worst?.label).toBe("Mar 22");
    expect(report.weekendOcc).toBe(0.5);
    expect(report.missingDates).toEqual(["2026-09-21", "2026-09-23", "2026-09-24", "2026-09-26", "2026-09-27"]);
    expect(report.pendingAtEnd).toBe(7_000);
    expect(report.problems).toEqual([{ date: "2026-09-22", text: "Ducha" }]);
    expect(report.replenish).toBe("Toallas");
    expect(report.expenseCategories).toEqual([
      { name: "Insumos y limpieza", amount: 5_000 },
      { name: "Sin categoría", amount: 3_000 },
    ]);
    expect(report.conclusions[0]).toContain("+100,0% frente a la semana anterior");
  });
});
