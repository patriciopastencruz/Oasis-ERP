import { describe, expect, it } from "vitest";
import {
  DEFAULT_BONUS_WEIGHTS,
  cappedOccupancyPct,
  closingDeadline,
  computeBonus,
  tierFactor,
  type BonusInput,
} from "./reception-bonus";

const base: BonusInput = {
  pool: 100000,
  weights: { ...DEFAULT_BONUS_WEIGHTS },
  occupancy: { value: 82, goal: 80 },
  adr: { value: 31000, goal: 29000 },
  booking: { value: 7.6, goal: 7.5 },
  survey: { value: 4.6, goal: 4, responses: 12, minResponses: 5 },
  inspections: { cleanings: 100, inspected: 100, avgWaitMinutes: 40, maxWaitMinutes: 70 },
  order: { closings: { due: 20, onTime: 20, lateDays: [] }, balances: { count: 0, total: 0 } },
};

const row = (r: ReturnType<typeof computeBonus>, key: string) => r.rows.find((x) => x.key === key)!;

describe("bono de recepción", () => {
  it("los pesos por defecto suman 100", () => {
    expect(Object.values(DEFAULT_BONUS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("todo cumplido paga el monto completo", () => {
    const r = computeBonus(base);
    expect(r.points).toBeCloseTo(100, 5);
    expect(r.amount).toBe(100000);
    expect(r.gateApplied).toBe(false);
  });

  it("escalones: cumple = todo, 90-99% de la meta = mitad, menos = nada", () => {
    expect(tierFactor(80, 80)).toBe(1);
    expect(tierFactor(72, 80)).toBe(0.5); // 90%
    expect(tierFactor(71.9, 80)).toBe(0);
    expect(tierFactor(5, 0)).toBe(1);
  });

  it("ocupación: cumple o no cumple, sin término medio", () => {
    expect(row(computeBonus({ ...base, occupancy: { value: 90, goal: 90 } }), "occupancy").status).toBe("met");
    const near = row(computeBonus({ ...base, occupancy: { value: 89.9, goal: 90 } }), "occupancy");
    expect(near.status).toBe("miss");
    expect(near.earned).toBe(0);
  });

  it("venta promedio: cumple o no cumple, sin término medio", () => {
    expect(row(computeBonus({ ...base, adr: { value: 29000, goal: 29000 } }), "adr").status).toBe("met");
    const near = row(computeBonus({ ...base, adr: { value: 28999, goal: 29000 } }), "adr");
    expect(near.status).toBe("miss");
    expect(near.earned).toBe(0);
  });

  it("aseo: cumple solo si todo se inspeccionó y el tiempo promedio no pasa de los 70 minutos", () => {
    expect(row(computeBonus(base), "inspections").status).toBe("met");
    expect(row(computeBonus({ ...base, inspections: { ...base.inspections, avgWaitMinutes: 70 } }), "inspections").status).toBe("met");
    const slow = row(computeBonus({ ...base, inspections: { ...base.inspections, avgWaitMinutes: 71 } }), "inspections");
    expect(slow.status).toBe("miss");
    expect(slow.earned).toBe(0);
    const missing = row(computeBonus({ ...base, inspections: { ...base.inspections, inspected: 99 } }), "inspections");
    expect(missing.status).toBe("miss");
    expect(missing.criteria.filter((c) => !c.ok)).toHaveLength(1);
  });

  it("aseo sin aseos terminados en el mes no se evalúa", () => {
    const r = computeBonus({ ...base, inspections: { cleanings: 0, inspected: 0, avgWaitMinutes: null, maxWaitMinutes: 70 } });
    expect(row(r, "inspections").status).toBe("na");
    expect(r.points).toBeCloseTo(100, 5);
  });

  it("orden: es de cumple o no cumple; un cierre atrasado basta para no cumplir", () => {
    const r = computeBonus({ ...base, order: { ...base.order, closings: { due: 20, onTime: 19, lateDays: [7] } } });
    const order = row(r, "order");
    expect(order.status).toBe("miss");
    expect(order.earned).toBe(0);
    expect(order.criteria[0].text).toContain("7");
    expect(r.gateApplied).toBe(false); // cumple el otro criterio
    expect(r.amount).toBe(85000);
  });

  it("orden: un saldo pendiente de una estadía terminada también hace que no cumpla", () => {
    const r = computeBonus({ ...base, order: { ...base.order, balances: { count: 2, total: 45000 } } });
    expect(row(r, "order").status).toBe("miss");
    expect(row(r, "order").criteria[1].text).toContain("2 estadías");
    expect(r.gateApplied).toBe(false);
  });

  it("si no se cumple ningún criterio de orden, además el bono se reduce a la mitad", () => {
    const r = computeBonus({ ...base, order: { closings: { due: 20, onTime: 10, lateDays: [1, 2] }, balances: { count: 1, total: 30000 } } });
    expect(row(r, "order").status).toBe("miss");
    expect(r.gateApplied).toBe(true);
    expect(r.amountBeforeGate).toBe(85000);
    expect(r.amount).toBe(42500);
  });

  it("orden: sin cierres vencidos (inicio de mes) se evalúan solo los saldos", () => {
    const r = computeBonus({ ...base, order: { closings: null, balances: { count: 0, total: 0 } } });
    expect(row(r, "order").criteria).toHaveLength(1);
    expect(row(r, "order").status).toBe("met");
  });

  it("Booking: cumple o no cumple, sin término medio", () => {
    expect(row(computeBonus({ ...base, booking: { value: 7.5, goal: 7.5 } }), "booking").status).toBe("met");
    const near = row(computeBonus({ ...base, booking: { value: 7.4, goal: 7.5 } }), "booking");
    expect(near.status).toBe("miss");
    expect(near.earned).toBe(0);
  });

  it("encuesta: la mitad por reunir el mínimo de evaluaciones y la otra mitad por el promedio", () => {
    const survey = (value: number | null, responses: number) =>
      row(computeBonus({ ...base, survey: { value, goal: 4, responses, minResponses: 5 } }), "survey");
    expect(survey(4, 5).status).toBe("met");
    expect(survey(4, 5).earned).toBeCloseTo(10, 5);
    const enoughButLow = survey(3.9, 5);
    expect(enoughButLow.status).toBe("half");
    expect(enoughButLow.earned).toBeCloseTo(5, 5);
    // Con menos de 5 evaluaciones no hay mitad por el mínimo ni cuenta el promedio.
    const few = survey(5, 4);
    expect(few.status).toBe("miss");
    expect(few.earned).toBe(0);
    expect(survey(null, 0).earned).toBe(0);
  });

  it("los indicadores sin meta o sin datos se dejan fuera y su peso se reparte", () => {
    const r = computeBonus({
      ...base,
      adr: { value: null, goal: null },
      inspections: { cleanings: null, inspected: 0, avgWaitMinutes: null, maxWaitMinutes: 70 },
    });
    expect(row(r, "adr").status).toBe("na");
    expect(r.evaluatedWeight).toBe(70);
    expect(r.points).toBeCloseTo(100, 5); // cumple todo lo evaluado
    const effective = r.rows.filter((x) => x.status !== "na").reduce((s, x) => s + x.effectiveWeight, 0);
    expect(effective).toBeCloseTo(100, 5);
  });

  it("sin nada evaluable no paga", () => {
    const r = computeBonus({
      ...base,
      occupancy: { value: null, goal: null },
      adr: { value: null, goal: null },
      booking: { value: null, goal: null },
      survey: { value: null, goal: 4, responses: 0, minResponses: 5 },
      inspections: { cleanings: null, inspected: 0, avgWaitMinutes: null, maxWaitMinutes: 70 },
      order: { closings: null, balances: null },
    });
    expect(r.points).toBe(0);
    expect(r.amount).toBe(0);
  });

  it("la ocupación limita cada día a 110%", () => {
    // 5 habitaciones: un día con 9 ocupaciones (180%) cuenta como 110%
    expect(cappedOccupancyPct([{ occupied: 5 }, { occupied: 9 }], 5)).toBeCloseTo(105, 5);
    expect(cappedOccupancyPct([], 5)).toBeNull();
  });

  it("el plazo de un cierre vence a las 06:00 de Santiago del día siguiente", () => {
    // Octubre: horario de verano de Chile (UTC-3) → 09:00 UTC.
    expect(closingDeadline("2026-10-10").toISOString()).toBe("2026-10-11T09:00:00.000Z");
    // Junio: horario de invierno (UTC-4) → 10:00 UTC.
    expect(closingDeadline("2026-06-10").toISOString()).toBe("2026-06-11T10:00:00.000Z");
  });
});
