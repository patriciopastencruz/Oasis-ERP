import { describe, expect, it } from "vitest";
import { dayIndicators, dayOverDay, pctChange } from "./day-over-day";

describe("variación contra el día anterior", () => {
  it("calcula el porcentaje y no inventa datos", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, undefined)).toBeNull();
  });

  it("venta promedio y RevPAR de un día", () => {
    // 3 habitaciones ocupadas de 5, venta $90.000 → ADR 30.000, RevPAR 18.000
    expect(dayIndicators({ occupied: 3, revenue: 90000 }, 5)).toEqual({ adr: 30000, revpar: 18000 });
    expect(dayIndicators({ occupied: 0, revenue: 0 }, 5)).toEqual({ adr: null, revpar: 0 });
    expect(dayIndicators(undefined, 5)).toEqual({ adr: null, revpar: null });
  });

  it("compara el día de hoy con ayer y el acumulado del mes con el de ayer", () => {
    const r = dayOverDay({
      today: { occupied: 4, revenue: 132000 }, // ADR 33.000, RevPAR 26.400
      yesterday: { occupied: 3, revenue: 90000 }, // ADR 30.000, RevPAR 18.000
      totalRooms: 5,
      cumulativeNow: { adr: 31000, revpar: 20000 },
      cumulativeBefore: { adr: 30000, revpar: 20000 },
    });
    expect(r.available).toBe(true);
    expect(r.day.adr.pct).toBeCloseTo(10, 5);
    expect(r.day.revpar.pct).toBeCloseTo(46.67, 1);
    expect(r.cumulative.adr.pct).toBeCloseTo(3.33, 1);
    expect(r.cumulative.revpar.pct).toBe(0);
  });

  it("sin día anterior todo queda sin comparar", () => {
    const r = dayOverDay({
      today: { occupied: 2, revenue: 50000 },
      yesterday: undefined,
      totalRooms: 5,
      cumulativeNow: { adr: 25000, revpar: 10000 },
      cumulativeBefore: null,
    });
    expect(r.available).toBe(false);
    expect(r.day.adr.pct).toBeNull();
    expect(r.cumulative.revpar.pct).toBeNull();
  });
});
