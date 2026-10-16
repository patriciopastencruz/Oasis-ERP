import { describe, expect, it } from "vitest";
import { SUPERVISOR_WEIGHTS, computeSupervisorBonus, type SupervisorInput } from "./supervisor-bonus";

const base: SupervisorInput = {
  pool: 150000,
  receptionPoints: 100,
  audits: { assigned: 4, completed: 4 },
  receipts: { overdue: 0 },
  closings: { total: 20, corrected: 0, correctedDays: [] },
  booking: { value: 7.6, goal: 7.5 },
};
const row = (r: ReturnType<typeof computeSupervisorBonus>, key: string) => r.rows.find((x) => x.key === key)!;

describe("bono del supervisor", () => {
  it("los pesos suman 100", () => {
    expect(Object.values(SUPERVISOR_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("recepción al 100% y todos los controles cumplidos paga el monto completo", () => {
    const r = computeSupervisorBonus(base);
    expect(r.points).toBeCloseTo(100, 5);
    expect(r.amount).toBe(150000);
  });

  it("ejemplo: recepción con 70 puntos, cumple tres controles y falla Booking", () => {
    const r = computeSupervisorBonus({ ...base, receptionPoints: 70, booking: { value: 7.0, goal: 7.5 } });
    // 70 × 60% = 42, más 10 + 10 + 10 = 72
    expect(row(r, "result").earned).toBeCloseTo(42, 5);
    expect(r.points).toBeCloseTo(72, 5);
    expect(r.amount).toBe(108000);
  });

  it("con la recepción en 0 y los controles cumplidos gana el 40%; sin controles gana el 60% del puntaje de recepción", () => {
    expect(computeSupervisorBonus({ ...base, receptionPoints: 0 }).points).toBeCloseTo(40, 5);
    const none = computeSupervisorBonus({
      ...base,
      audits: { assigned: 4, completed: 2 },
      receipts: { overdue: 3 },
      closings: { total: 20, corrected: 5, correctedDays: [1, 2, 3, 4, 5] },
      booking: { value: 6, goal: 7.5 },
    });
    expect(none.points).toBeCloseTo(60, 5);
  });

  it("auditorías: cumple solo si se completaron todas las asignadas; sin asignadas no se evalúa", () => {
    expect(row(computeSupervisorBonus({ ...base, audits: { assigned: 4, completed: 3 } }), "audits").status).toBe("miss");
    const na = computeSupervisorBonus({ ...base, audits: { assigned: 0, completed: 0 } });
    expect(row(na, "audits").status).toBe("na");
    expect(na.evaluatedWeight).toBe(90);
    expect(na.points).toBeCloseTo(100, 5); // el peso se reparte entre los demás
  });

  it("comprobantes: un solo comprobante con diferencia sin resolver después de 48 horas no cumple", () => {
    const r = computeSupervisorBonus({ ...base, receipts: { overdue: 1 } });
    expect(row(r, "receipts").status).toBe("miss");
    expect(row(r, "receipts").text).toContain("48");
  });

  it("cierres: hasta 10% corregidos cumple y sobre 10% no", () => {
    expect(row(computeSupervisorBonus({ ...base, closings: { total: 20, corrected: 2, correctedDays: [3, 9] } }), "closings").status).toBe("met");
    const miss = row(computeSupervisorBonus({ ...base, closings: { total: 20, corrected: 3, correctedDays: [3, 9, 12] } }), "closings");
    expect(miss.status).toBe("miss");
    expect(miss.text).toContain("3, 9, 12");
  });

  it("Booking: cumple o no cumple contra la meta del hostal", () => {
    expect(row(computeSupervisorBonus({ ...base, booking: { value: 7.5, goal: 7.5 } }), "booking").status).toBe("met");
    expect(row(computeSupervisorBonus({ ...base, booking: { value: 7.4, goal: 7.5 } }), "booking").earned).toBe(0);
  });
});
