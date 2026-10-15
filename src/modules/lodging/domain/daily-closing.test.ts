import { describe, expect, it } from "vitest";
import {
  closingExtras,
  defaultClosingDate,
  type ClosingMetrics,
  executiveContext,
  executiveHistoryStart,
  formatClosingDate,
  longDayLabel,
  isValidDay,
  periodRange,
  shiftPeriod,
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

  it("compara la venta promedio con el cierre del día anterior", () => {
    const withRate = (d: string, rate: number, occupied = 10) => ({ ...row(d, 0, occupied), average_rate: rate });
    expect(executiveContext(withRate("2025-09-30", 31500), [withRate("2025-09-29", 30000)]).averageRateChange).toBe(5);
    expect(executiveContext(withRate("2025-09-30", 29400), [withRate("2025-09-29", 30000)]).averageRateChange).toBe(-2);
    // Sin cierre ayer, o ayer sin ocupación: no compara.
    expect(executiveContext(withRate("2025-09-30", 31500), [withRate("2025-09-28", 30000)]).averageRateChange).toBeNull();
    expect(executiveContext(withRate("2025-09-30", 31500), [withRate("2025-09-29", 0, 0)]).averageRateChange).toBeNull();
  });

  it("sin historia no inventa comparaciones", () => {
    const ctx = executiveContext(row("2025-09-30", 1000), []);
    expect(ctx.change).toBeNull();
    expect(ctx.averageRateChange).toBeNull();
    expect(ctx.month.previousIncome).toBeNull();
    expect(longDayLabel("2025-09-30")).toBe("Martes 30-09-2025");
  });
});

describe("closingExtras: porcentajes", () => {
  const base = {
    by_origin: [
      { origin: "booking", rooms: 2, revenue: 150000, arrivals: 1 },
      { origin: "direct", rooms: 1, revenue: 50000, arrivals: 0 },
    ],
    availability_10d: [
      { date: "2026-10-09", total: 10, occupied: 4 },
      { date: "2026-10-10", total: 0, occupied: 0 },
    ],
  } as unknown as ClosingMetrics;

  it("reparte el monto entre orígenes en porcentaje del total", () => {
    const { origins } = closingExtras(base);
    expect(origins.map((o) => o.share)).toEqual([75, 25]);
  });

  it("sin monto no divide por cero", () => {
    const { origins } = closingExtras({
      ...base,
      by_origin: [{ origin: "booking", rooms: 1, revenue: 0, arrivals: 0 }],
    } as unknown as ClosingMetrics);
    expect(origins[0].share).toBe(0);
  });

  it("expresa la disponibilidad como porcentaje de ocupación", () => {
    const { availability } = closingExtras(base);
    expect(availability[0].occupiedPct).toBe(40);
    expect(availability[0].availablePct).toBe(60);
    expect(availability[1].occupiedPct).toBe(0);
  });
});

describe("fecha propuesta para el cierre", () => {
  // 2026-10-13 en Santiago es UTC-3 (horario de verano ya vigente).
  it("de madrugada propone el día anterior", () => {
    expect(defaultClosingDate(new Date("2026-10-13T03:03:00Z"))).toBe("2026-10-12"); // 00:03
    expect(defaultClosingDate(new Date("2026-10-13T08:59:00Z"))).toBe("2026-10-12"); // 05:59
  });

  it("desde las 06:00 propone el día de hoy", () => {
    expect(defaultClosingDate(new Date("2026-10-13T09:00:00Z"))).toBe("2026-10-13"); // 06:00
    expect(defaultClosingDate(new Date("2026-10-13T23:30:00Z"))).toBe("2026-10-13"); // 20:30
  });
});
