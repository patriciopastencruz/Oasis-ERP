import { describe, expect, it } from "vitest";
import { combineTotals, pct, periodRange, roomPriority, sinceLabel, type OpsKpis } from "./ops-kpis";

const kpi = (t: Partial<OpsKpis["totals"]>, rejected = 0): OpsKpis => ({
  unit: { id: "u", code: "HU", name: "Hostal Uruguay" },
  from: "2026-09-01",
  to: "2026-09-30",
  totals: { cleanings: 0, avg_minutes: null, max_minutes: null, rework: 0, inspected: 0, approved_first: 0, first_attempt: 0, avg_wait_minutes: null, ...t },
  inspections: { total: 0, approved: 0, rejected },
  rejection_reasons: [],
  by_room: [],
  by_person: [],
  by_inspector: [],
});

describe("indicadores de operación", () => {
  it("períodos en fechas de Santiago", () => {
    expect(periodRange("today", "2026-09-30")).toEqual({ from: "2026-09-30", to: "2026-09-30" });
    expect(periodRange("week", "2026-09-30")).toEqual({ from: "2026-09-24", to: "2026-09-30" });
    expect(periodRange("month", "2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("combina hostales con promedios ponderados", () => {
    const t = combineTotals([
      kpi({ cleanings: 10, avg_minutes: 30, max_minutes: 50, rework: 1, inspected: 10, first_attempt: 9, approved_first: 8, avg_wait_minutes: 20 }, 2),
      kpi({ cleanings: 30, avg_minutes: 40, max_minutes: 70, rework: 3, inspected: 30, first_attempt: 27, approved_first: 24, avg_wait_minutes: 40 }, 3),
      kpi({}),
    ]);
    expect(t).toEqual({ cleanings: 40, avgMinutes: 38, maxMinutes: 70, rework: 4, approvedFirstPct: 89, avgWaitMinutes: 35, inspected: 40, rejected: 5 });
    expect(combineTotals([kpi({})])).toMatchObject({ avgMinutes: null, maxMinutes: null, approvedFirstPct: null });
  });

  it("ordena primero lo que requiere acción", () => {
    const rooms = [
      { operational_status: "inspected" as const, display_order: 1 },
      { operational_status: "dirty" as const, display_order: 2 },
      { operational_status: "inspected" as const, display_order: 3, incidents: { open: 1, blocking: false, top_priority: "low" as const } },
      { operational_status: "maintenance" as const, display_order: 4 },
    ];
    expect([...rooms].sort(roomPriority).map((r) => r.display_order)).toEqual([4, 2, 3, 1]);
  });

  it("formatea tiempos y porcentajes", () => {
    const now = new Date("2026-09-30T15:00:00Z");
    expect(sinceLabel("2026-09-30T14:15:00Z", now)).toBe("45 min");
    expect(sinceLabel("2026-09-30T12:50:00Z", now)).toBe("2 h 10 min");
    expect(sinceLabel("2026-09-27T15:00:00Z", now)).toBe("3 d");
    expect(sinceLabel("2026-09-28T15:12:00Z", now)).toBe("1 d");
    expect(sinceLabel(null, now)).toBe("—");
    expect([pct(1, 4), pct(0, 0)]).toEqual([25, null]);
  });
});
