import { describe, expect, it } from "vitest";
import { goalMet, goalsFromRow, revparGoal } from "./report-goals";

describe("metas del reporte semanal", () => {
  it("lee la fila de la base", () => {
    const g = goalsFromRow({ occupancy_pct: "80.00", average_rate: "26000", booking_score: "8.0", booking_categories: { cleanliness: 8, wifi: "7" } });
    expect(g).toEqual({ occupancyPct: 80, averageRate: 26000, bookingScore: 8, categories: { cleanliness: 8, wifi: 7 } });
    expect(goalsFromRow(null).occupancyPct).toBeNull();
  });

  it("RevPAR meta = venta promedio × ocupación", () => {
    expect(revparGoal({ occupancyPct: 80, averageRate: 26000, bookingScore: null, categories: {} })).toBe(20800);
    expect(revparGoal({ occupancyPct: null, averageRate: 26000, bookingScore: null, categories: {} })).toBeNull();
  });

  it("cumple al alcanzar la meta", () => {
    expect([goalMet(80, 80), goalMet(79.9, 80), goalMet(8, null), goalMet(null, 8)]).toEqual([true, false, null, null]);
  });
});
