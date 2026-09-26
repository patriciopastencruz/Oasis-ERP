import { describe, expect, it } from "vitest";
import {
  executiveContext,
  executiveHistoryStart,
  formatClosingDate,
  longDayLabel,
  isValidDay,
  periodRange,
  shiftPeriod,
  summarizePeriod,
} from "./daily-closing";

describe("períodos de cierre", () => {
  it("la semana va de lunes a domingo", () => {
    expect(periodRange("week", "2026-09-30")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(periodRange("week", "2026-10-04")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("la quincena es 1-15 o 16-fin de mes", () => {
    expect(periodRange("fortnight", "2026-02-15")).toEqual({ start: "2026-02-01", end: "2026-02-15" });
    expect(periodRange("fortnight", "2026-02-16")).toEqual({ start: "2026-02-16", end: "2026-02-28" });
    expect(periodRange("fortnight", "2028-02-20").end).toBe("2028-02-29");
  });

  it("el mes cubre del 1 al último día y se puede navegar", () => {
    expect(periodRange("month", "2026-09-17")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(shiftPeriod("month", "2026-09-17", -1)).toBe("2026-08-31");
    expect(shiftPeriod("fortnight", "2026-09-03", 1)).toBe("2026-09-16");
  });

  it("valida fechas y las formatea como el reporte manual", () => {
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2026-09-30")).toBe(true);
    expect(formatClosingDate("2025-09-30")).toBe("30-09-2025");
  });
});

describe("consolidado del período", () => {
  const closing = (closing_date: string, total_received: number, occupied: number, expense = 0) => ({
    closing_date,
    total_rooms: 10,
    occupied_rooms: occupied,
    occupancy_pct: occupied * 10,
    cash_received: 0,
    transfer_received: total_received,
    card_received: 0,
    airbnb_received: 0,
    other_received: 0,
    total_received,
    expense_total: expense,
    net_result: total_received - expense,
    pending_amount: 1000 * occupied,
    metrics: { day_revenue: occupied * 30000 },
  });

  it("suma ingresos y gastos, pondera ocupación y detecta días sin cierre", () => {
    const summary = summarizePeriod(
      [closing("2026-09-02", 200000, 8, 5000), closing("2026-09-01", 100000, 4, 1150)],
      { start: "2026-09-01", end: "2026-09-07" },
      "2026-09-03",
    );
    expect(summary.totalReceived).toBe(300000);
    expect(summary.expenseTotal).toBe(6150);
    expect(summary.netResult).toBe(293850);
    expect(summary.occupancyPct).toBe(60);
    expect(summary.averageAvailableRooms).toBe(4);
    expect(summary.averageRate).toBe(30000);
    expect(summary.elapsedDays).toBe(3);
    expect(summary.missingDates).toEqual(["2026-09-03"]);
    expect(summary.lastPending).toBe(8000);
    expect(summary.days.map((d) => d.closing_date)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("un período sin cierres no divide por cero", () => {
    const summary = summarizePeriod([], { start: "2026-10-01", end: "2026-10-31" }, "2026-09-25");
    expect(summary).toMatchObject({ occupancyPct: 0, averageRate: 0, elapsedDays: 0, missingDates: [] });
  });
});

describe("hoja ejecutiva", () => {
  const row = (closing_date: string, total_received: number, occupied = 10, expense_total = 0) => ({
    closing_date,
    total_received,
    expense_total,
    occupied_rooms: occupied,
    total_rooms: 15,
  });

  it("arma los 7 días, compara contra el promedio previo y marca días sin cierre", () => {
    const ctx = executiveContext(row("2025-09-30", 750000, 15), [
      row("2025-09-24", 400000),
      row("2025-09-25", 500000),
      row("2025-09-27", 600000),
      row("2025-09-30", 1), // un cierre previo de la misma fecha se ignora
    ]);
    expect(ctx.week.map((d) => d.label)).toEqual(["Mié 24", "Jue 25", "Vie 26", "Sáb 27", "Dom 28", "Lun 29", "Mar 30"]);
    expect(ctx.week[2].income).toBeNull();
    expect(ctx.week[6]).toMatchObject({ income: 750000, occupancy: 100 });
    expect(ctx.priorAverage).toBe(500000);
    expect(ctx.change).toBe(50);
  });

  it("acumula el mes a la fecha y lo compara con el mes anterior al mismo día", () => {
    const ctx = executiveContext(row("2025-03-30", 100000, 12, 5000), [
      row("2025-03-01", 200000, 9, 1000),
      row("2025-02-10", 50000),
      row("2025-02-28", 70000),
      row("2025-01-31", 999999),
    ]);
    expect(ctx.month).toMatchObject({
      name: "marzo",
      income: 300000,
      expense: 6000,
      occupancy: 70,
      closedDays: 2,
      elapsedDays: 30,
      previousName: "febrero",
      previousIncome: 120000,
    });
    expect(executiveHistoryStart("2025-03-30")).toBe("2025-02-01");
    expect(executiveHistoryStart("2025-03-03")).toBe("2025-02-01");
  });

  it("sin historia no inventa comparaciones", () => {
    const ctx = executiveContext(row("2025-09-30", 1000), []);
    expect(ctx.change).toBeNull();
    expect(ctx.month.previousIncome).toBeNull();
    expect(longDayLabel("2025-09-30")).toBe("Martes 30-09-2025");
  });
});
