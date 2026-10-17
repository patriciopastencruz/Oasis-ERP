import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPORT_GOALS,
  computeSupportBonus,
  countNightReservations,
  groupPoints,
  isWeekday,
  monthlyGoal,
  nightShiftDay,
  weekdaysInMonth,
} from "./support-bonus";

const hostal = (code: string, name: string, pool: number, points: number, created: number, goal: number) => ({ code, name, pool, points, created, goal });

describe("bono de apoyo transversal", () => {
  it("la noche es de 19:00 a 06:00 y se atribuye al día en que empieza", () => {
    // Octubre: Santiago está en UTC-3.
    expect(nightShiftDay("2026-10-13T23:30:00Z")).toBe("2026-10-13"); // martes 20:30
    expect(nightShiftDay("2026-10-14T05:00:00Z")).toBe("2026-10-13"); // miércoles 02:00 → noche del martes
    expect(nightShiftDay("2026-10-13T15:00:00Z")).toBeNull(); // martes 12:00, de día
    expect(nightShiftDay("2026-10-13T21:59:00Z")).toBeNull(); // 18:59
    expect(nightShiftDay("2026-10-13T22:00:00Z")).toBe("2026-10-13"); // 19:00
  });

  it("solo cuentan las noches de lunes a viernes: la madrugada del sábado es del viernes y la noche del sábado no cuenta", () => {
    expect(isWeekday("2026-10-16")).toBe(true); // viernes
    expect(isWeekday("2026-10-17")).toBe(false); // sábado
    const created = [
      { created_at: "2026-10-17T05:00:00Z", business_unit_id: "a" }, // sábado 02:00 → noche del viernes: cuenta
      { created_at: "2026-10-17T23:00:00Z", business_unit_id: "a" }, // sábado 20:00: no
      { created_at: "2026-10-18T05:00:00Z", business_unit_id: "a" }, // domingo 02:00 → noche del sábado: no
      { created_at: "2026-10-19T23:00:00Z", business_unit_id: "b" }, // lunes 20:00: cuenta
    ];
    const count = countNightReservations(created, "2026-10-01", "2026-10-31");
    expect(count.get("a")).toBe(1);
    expect(count.get("b")).toBe(1);
    expect(countNightReservations(created, "2026-10-18", "2026-10-31").get("a")).toBeUndefined();
  });

  it("las metas de reservas de noche son un número fijo por mes en cada hostal", () => {
    expect(weekdaysInMonth("2026-10")).toBe(22);
    expect(monthlyGoal("HOC", DEFAULT_SUPPORT_GOALS)).toBe(10);
    expect(monthlyGoal("HU", DEFAULT_SUPPORT_GOALS)).toBe(10);
    expect(monthlyGoal("HOB", DEFAULT_SUPPORT_GOALS)).toBe(6);
  });

  it("el resultado conjunto pondera cada hostal por su bono máximo", () => {
    expect(groupPoints([{ pool: 150000, points: 100 }, { pool: 150000, points: 0 }, { pool: 100000, points: 0 }])).toBeCloseTo(37.5, 5);
    expect(groupPoints([])).toBeNull();
  });

  const full = { closings: { expected: 66, issued: 66, onTime: 66 }, payments: { total: 19, withReceipt: 19, withDifference: 0 } };
  const hostales = (points: number, created: [number, number, number]) => [
    hostal("HOC", "Centro", 150000, points, created[0], 30),
    hostal("HU", "Uruguay", 100000, points, created[1], 30),
    hostal("HOB", "Cobija", 150000, points, created[2], 13),
  ];

  it("los pesos suman 100: 15 de los hostales y 85 de su gestión", () => {
    const r = computeSupportBonus({ pool: 100000, hostales: hostales(0, [0, 0, 0]), ...full });
    expect(r.rows.reduce((s, x) => s + x.weight, 0)).toBe(100);
    expect(r.rows.find((x) => x.key === "group")!.weight).toBe(15);
    expect(r.rows.filter((x) => x.key !== "group").reduce((s, x) => s + x.weight, 0)).toBe(85);
    // Las reservas de noche son lo que más pesa: 65 de los 85 puntos de su gestión.
    expect(r.rows.filter((x) => ["HOC", "HU", "HOB"].includes(x.key)).reduce((s, x) => s + x.weight, 0)).toBe(65);
  });

  it("ejemplo con los datos de octubre: reservas a mitad de camino, la mitad de los cierres y 5 comprobantes con diferencia", () => {
    const r = computeSupportBonus({
      pool: 100000,
      hostales: hostales(40, [11, 5, 0]).map((h) => (h.code === "HOC" || h.code === "HU" ? { ...h, goal: 22 } : h)),
      closings: { expected: 66, issued: 33, onTime: 33 },
      payments: { total: 19, withReceipt: 19, withDifference: 5 },
    });
    const earned = (k: string) => r.rows.find((x) => x.key === k)!.earned;
    expect(earned("group")).toBeCloseTo(6, 5); // 40 de 100 en conjunto × 15%
    expect(earned("HOC")).toBeCloseTo(12, 5); // 24 × 11/22
    expect(earned("HU")).toBeCloseTo(5.4545, 3); // 24 × 5/22
    expect(earned("HOB")).toBeCloseTo(0, 5);
    expect(earned("closings_done")).toBeCloseTo(2.5, 5); // hizo 33 de los 66 cierres
    expect(earned("closings_on_time")).toBeCloseTo(5, 5); // los 33 estuvieron a tiempo
    expect(earned("payments_receipt")).toBeCloseTo(5, 5);
    expect(earned("payments_clean")).toBeCloseTo(3.684, 3);
    expect(r.points).toBeCloseTo(39.64, 2);
    expect(r.amount).toBe(39639);
  });

  it("máximo y mínimo", () => {
    expect(computeSupportBonus({ pool: 100000, hostales: hostales(100, [100, 100, 100]), ...full }).amount).toBe(100000); // las reservas topan en la meta
    // hostales en 0 y su gestión perfecta: gana el 85%
    expect(computeSupportBonus({ pool: 100000, hostales: hostales(0, [100, 100, 100]), ...full }).amount).toBe(85000);
    // hostales al 100% y sin gestión: gana el 15%
    expect(
      computeSupportBonus({
        pool: 100000,
        hostales: hostales(100, [0, 0, 0]),
        closings: { expected: 66, issued: 0, onTime: 0 },
        payments: { total: 10, withReceipt: 0, withDifference: 0 },
      }).amount,
    ).toBe(15000);
  });

  it("sin cierres ni pagos en el mes esas partes se dejan fuera y su peso se reparte", () => {
    const r = computeSupportBonus({ pool: 100000, hostales: hostales(100, [100, 100, 100]), closings: null, payments: { total: 0, withReceipt: 0, withDifference: 0 } });
    expect(r.rows.find((x) => x.key === "closings_done")).toBeUndefined();
    expect(r.rows.find((x) => x.key === "payments_receipt")).toBeUndefined();
    expect(r.points).toBeCloseTo(100, 5);
  });

  it("un hostal sin meta se deja fuera y su peso se reparte", () => {
    const hs = hostales(100, [30, 0, 13]).map((h) => (h.code === "HU" ? { ...h, goal: 0 } : h));
    const r = computeSupportBonus({ pool: 100000, hostales: hs, ...full });
    expect(r.rows.find((x) => x.key === "HU")).toBeUndefined();
    expect(r.points).toBeCloseTo(100, 5);
  });
});
