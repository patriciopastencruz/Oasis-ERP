import { describe, expect, it } from "vitest";
import {
  DEFAULT_BONUS_WEIGHTS,
  cappedOccupancyPct,
  computeBonus,
  tierFactor,
  type BonusInput,
} from "./reception-bonus";

const base: BonusInput = {
  pool: 100000,
  weights: { ...DEFAULT_BONUS_WEIGHTS },
  occupancy: { value: 82, goal: 80 },
  revpar: { value: 21000, goal: 20000 },
  booking: { value: 7.6, goal: 7.5, previous: 7.4 },
  survey: { value: 4.6, goal: 4.5, responses: 12, minResponses: 5 },
  housekeeping: { value: 90, goal: 85 },
  order: { closings: 100, prices: 98, receipts: 96 },
};

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

  it("ejemplo: cumple ocupación, RevPAR y Booking; el resto no llega", () => {
    const r = computeBonus({
      ...base,
      survey: { ...base.survey, value: 3.0 },
      housekeeping: { value: 50, goal: 85 },
      order: { closings: 92, prices: 92, receipts: 92 }, // 92 → mitad, sin compuerta
    });
    // 25 + 25 + 20 + 0 + 0 + 7,5 (mitad de 15)
    expect(r.points).toBeCloseTo(77.5, 5);
    expect(r.amount).toBe(77500);
  });

  it("la compuerta de orden reduce el bono a la mitad", () => {
    const r = computeBonus({ ...base, order: { closings: 80, prices: 90, receipts: 85 } }); // 85 < 90
    expect(r.gateApplied).toBe(true);
    // 85 puntos de 100 (todo menos orden) → 85.000, y la compuerta lo deja en 42.500
    expect(r.amountBeforeGate).toBe(85000);
    expect(r.amount).toBe(42500);
  });

  it("si el puntaje de Booking bajó respecto del mes anterior, gana la mitad aunque cumpla la meta", () => {
    const r = computeBonus({ ...base, booking: { value: 7.6, goal: 7.5, previous: 7.9 } });
    const booking = r.rows.find((x) => x.key === "booking")!;
    expect(booking.status).toBe("half");
    expect(booking.note).toContain("Bajó");
  });

  it("los indicadores sin meta o sin datos se dejan fuera y su peso se reparte", () => {
    const r = computeBonus({
      ...base,
      survey: { value: null, goal: 4.5, responses: 2, minResponses: 5 },
      housekeeping: { value: null, goal: 85 },
    });
    expect(r.rows.find((x) => x.key === "survey")!.status).toBe("na");
    expect(r.evaluatedWeight).toBe(85);
    expect(r.points).toBeCloseTo(100, 5); // cumple todo lo evaluado
    const effective = r.rows.filter((x) => x.status !== "na").reduce((s, x) => s + x.effectiveWeight, 0);
    expect(effective).toBeCloseTo(100, 5);
  });

  it("sin nada evaluable no paga", () => {
    const r = computeBonus({
      ...base,
      occupancy: { value: null, goal: null },
      revpar: { value: null, goal: null },
      booking: { value: null, goal: null, previous: null },
      survey: { value: null, goal: 4.5, responses: 0, minResponses: 5 },
      housekeeping: { value: null, goal: null },
      order: { closings: null, prices: null, receipts: null },
    });
    expect(r.points).toBe(0);
    expect(r.amount).toBe(0);
  });

  it("la ocupación limita cada día a 110%", () => {
    // 5 habitaciones: un día con 9 ocupaciones (180%) cuenta como 110%
    expect(cappedOccupancyPct([{ occupied: 5 }, { occupied: 9 }], 5)).toBeCloseTo(105, 5);
    expect(cappedOccupancyPct([], 5)).toBeNull();
  });
});
