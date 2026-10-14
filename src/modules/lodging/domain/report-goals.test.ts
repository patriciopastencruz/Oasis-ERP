import { describe, expect, it } from "vitest";
import { goalMet, goalsFromRow, revparGoal } from "./report-goals";

describe("metas del reporte semanal", () => {
  it("lee la fila de la base", () => {
    const g = goalsFromRow({ occupancy_pct: "80.00", average_rate: "26000", booking_score: "8.0", booking_categories: { cleanliness: 8, wifi: "7" } });
    expect(g).toEqual({ occupancyPct: 80, averageRate: 26000, revpar: null, bookingScore: 8, categories: { cleanliness: 8, wifi: 7 } });
    expect(goalsFromRow(null).occupancyPct).toBeNull();
  });

  it("RevPAR meta = venta promedio × ocupación", () => {
    const base = { occupancyPct: 80, averageRate: 26000, revpar: null, bookingScore: null, categories: {} };
    expect(revparGoal(base)).toBe(20800);
    expect(revparGoal({ ...base, occupancyPct: null })).toBeNull();
    // Meta propia del hostal (Centro: $27.000).
    expect(revparGoal({ ...base, occupancyPct: 90, averageRate: 27000, revpar: 27000 })).toBe(27000);
  });

  it("cumple al alcanzar la meta", () => {
    expect([goalMet(80, 80), goalMet(79.9, 80), goalMet(8, null), goalMet(null, 8)]).toEqual([true, false, null, null]);
  });
});
