import { describe, expect, it } from "vitest";
import {
  auditChecklistFrom,
  complianceLight,
  santiagoIsoWeekday,
  supervisionAlerts,
  weekTotals,
  type AuditUnitWeek,
  type MonthKpis,
} from "./audits";

const unit = (over: Partial<AuditUnitWeek>): AuditUnitWeek => ({
  id: "u",
  code: "HOC",
  name: "Hostal Oasis Centro",
  cleaned: 20,
  target: 4,
  passed: 0,
  failed: 0,
  done: 0,
  skipped: 0,
  pending: 4,
  compliance: 0,
  conformity: null,
  findings: 0,
  incidents: 0,
  ok_pct: 100,
  warning_pct: 80,
  open_audit: null,
  ...over,
});

describe("cumplimiento semanal", () => {
  it("semáforo 100% OK, 80–99% atención, <80% pendiente", () => {
    expect(complianceLight(100)).toBe("ok");
    expect(complianceLight(85)).toBe("warning");
    expect(complianceLight(79.9)).toBe("pending");
    expect(complianceLight(90, 90, 70)).toBe("ok");
  });

  it("totales multi-hostal: meta 10, realizadas 8 → 80%", () => {
    const t = weekTotals([
      unit({ target: 4, done: 3, passed: 3 }),
      unit({ target: 3, done: 2, passed: 1, failed: 1 }),
      unit({ target: 3, done: 3, passed: 3 }),
    ]);
    expect(t).toMatchObject({ target: 10, done: 8, compliance: 80, conformity: 87.5 });
  });
});

describe("checklist de auditoría", () => {
  it("lo no marcado queda OK y conserva observaciones y fallas", () => {
    const marks: Record<string, string> = { mark_bano: "fail", mark_olores: "observation", mark_cama: "raro" };
    const c = auditChecklistFrom((k) => marks[k] ?? null);
    expect(c).toMatchObject({ bano: "fail", olores: "observation", cama: "ok", presentacion: "ok" });
    expect(Object.keys(c)).toHaveLength(10);
  });
});

describe("alertas de supervisión", () => {
  const month = (over: Partial<MonthKpis>): MonthKpis => ({
    month: "2026-09-01",
    audits: 0,
    passed: 0,
    failed: 0,
    passed_pct: null,
    failed_pct: null,
    reception_discrepancy: 0,
    by_responsibility: {},
    categories: [],
    rooms: [],
    recurrent: [],
    reworks: 0,
    inspections_rejected: 0,
    inspections_total: 0,
    recent: [],
    ...over,
  });

  it("avisa hostal sin auditar, pendientes al cierre y fallas, sin repetir", () => {
    const week = {
      week_start: "2026-09-21",
      week_end: "2026-09-27",
      units: [
        unit({ id: "a", name: "Hostal Oasis Centro", target: 4, done: 0, pending: 4 }),
        unit({ id: "b", name: "Hostal Oasis Cobija", target: 3, done: 1, pending: 2, failed: 1 }),
        unit({ id: "c", name: "Hostal Uruguay", target: 3, done: 3, pending: 0, passed: 3 }),
      ],
    };
    const alerts = supervisionAlerts(
      week,
      {
        b: month({
          recurrent: [{ room_id: "r", room: "Hab 5", failed: 2 }],
          by_responsibility: { reception: 2 },
          categories: [{ category: "bano", count: 3, previous: 1 }],
        }),
      },
      6,
    );
    const texts = alerts.map((a) => a.text);
    // Las críticas van primero: hostal sin auditar a fin de semana y habitación reincidente.
    expect(alerts.slice(0, 2).every((a) => a.level === "critical")).toBe(true);
    expect(texts.slice(0, 2).some((t) => t.includes("Hab 5"))).toBe(true);
    expect(texts).toContain("Centro no tiene auditorías esta semana (meta 4).");
    expect(texts).toContain("Quedan 2 auditoría(s) en Cobija y la semana cierra el domingo.");
    expect(texts).toContain("1 auditoría(s) fallida(s) esta semana en Cobija.");
    expect(texts.some((t) => t.includes("inspección de recepción"))).toBe(true);
    expect(texts.some((t) => t.includes("Aumentan las fallas de baño"))).toBe(true);
    expect(texts.some((t) => t.includes("Uruguay"))).toBe(false);
  });

  it("a comienzo de semana no alerta por pendientes", () => {
    const week = { week_start: "", week_end: "", units: [unit({ target: 4, done: 0, pending: 4 })] };
    expect(supervisionAlerts(week, {}, 1)).toEqual([]);
  });

  it("calcula el día de la semana en Santiago", () => {
    // Domingo 27-09-2026 23:30 en Santiago = lunes 02:30 UTC.
    expect(santiagoIsoWeekday(new Date("2026-09-28T02:30:00Z"))).toBe(7);
  });
});
