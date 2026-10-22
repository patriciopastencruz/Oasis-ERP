import { describe, expect, it } from "vitest";
import {
  breakEven,
  buildStatement,
  monthOperations,
  monthlyConclusions,
  previousMonth,
  type MonthlySummary,
} from "./monthly-closing";

const summary = (overrides: Partial<MonthlySummary> = {}): MonthlySummary => ({
  period: "2026-07-01",
  days: 31,
  lodging_income: { total: 1_000_000, by_method: { transfer: 1_000_000 } },
  commissions: { amount: 50_000, category_id: "c-com" },
  daily_expenses: [{ category_id: "c-ins", name: "Insumos y limpieza", section: "variable", amount: 30_000, lines: 3 }],
  lines: [
    { id: "l1", category_id: "c-op", category: "Costos operativos", section: "fixed", description: "Arriendo", amount: 300_000, payer: "oasis", payment_status: "pagado" },
    { id: "l2", category_id: "c-inv", category: "Inversiones y mejoras", section: "investment", description: "Pasto", amount: 100_000, payer: null, payment_status: "pendiente" },
  ],
  categories: [
    { id: "c-op", section: "fixed", name: "Costos operativos", sort_order: 10, active: true },
    { id: "c-com", section: "variable", name: "Comisiones plataformas", sort_order: 10, active: true },
    { id: "c-ins", section: "variable", name: "Insumos y limpieza", sort_order: 30, active: true },
    { id: "c-inv", section: "investment", name: "Inversiones y mejoras", sort_order: 10, active: true },
  ],
  totals: { income: 1_000_000, fixed: 300_000, variable: 80_000, investment: 100_000, withdrawal: 0, other: 0, costs: 380_000, profit: 520_000 },
  pending: { count: 1, amount: 100_000 },
  daily_closings: { issued: 20 },
  ...overrides,
});

describe("estado de resultados", () => {
  it("agrupa automáticos y manuales por sección y categoría", () => {
    const st = buildStatement(summary());
    expect(st.map((s) => s.key)).toEqual(["income", "fixed", "variable", "investment", "withdrawal", "other"]);
    const variable = st.find((s) => s.key === "variable")!;
    expect(variable.groups.map((g) => [g.name, g.total])).toEqual([
      ["Comisiones plataformas", 50_000],
      ["Insumos y limpieza", 30_000],
    ]);
    expect(variable.groups[1].items[0]).toMatchObject({ kind: "auto", source: "diario" });
    expect(st[0].groups[0].items[0]).toMatchObject({ source: "reservas", amount: 1_000_000 });
    expect(st.find((s) => s.key === "investment")!.groups[0].items[0]).toMatchObject({ status: "pendiente", lineId: "l2" });
  });
});

describe("operación del mes", () => {
  const rooms = [
    { id: "r1", name: "Modular 2", room_type: "Modulares", display_order: 1 },
    { id: "r2", name: "Pieza 11", room_type: "Baño compartido", display_order: 2 },
  ];
  // r1: 30-jun a 03-jul (3 noches, 90.000) → 2 noches en julio; r2: 10 a 12-jul (2 noches, 40.000).
  const reservations = [
    { room_id: "r1", check_in: "2026-06-30", check_out: "2026-07-03", total_value: 90_000 },
    { room_id: "r2", check_in: "2026-07-10", check_out: "2026-07-12", total_value: 40_000 },
  ];
  const payments = [
    { paid_at: "2026-07-01T15:00:00Z", amount: 90_000, payment_method: "transfer" },
    { paid_at: "2026-06-30T15:00:00Z", amount: 5_000, payment_method: "cash" },
  ];
  const ops = monthOperations("2026-07", rooms, reservations, payments, "2026-09-26");

  it("devenga la venta por noche dentro del mes y calcula ocupación, ADR y RevPAR", () => {
    expect(ops.elapsedDays).toBe(31);
    expect(ops.nightsSold).toBe(4);
    expect(ops.revenue).toBe(100_000);
    expect(ops.adr).toBe(25_000);
    expect(ops.occupancy).toBeCloseTo(4 / 62);
    expect(ops.revpar).toBeCloseTo(100_000 / 62);
    expect(ops.received).toBe(90_000);
    expect(ops.byMethod).toEqual({ transfer: 90_000 });
  });

  it("detalla por habitación, tipo, día de la semana y semanas", () => {
    expect(ops.rooms.map((r) => [r.name, r.nights, r.revenue])).toEqual([
      ["Modular 2", 2, 60_000],
      ["Pieza 11", 2, 40_000],
    ]);
    expect(ops.types.find((t) => t.type === "Modulares")).toMatchObject({ nights: 2, adr: 30_000 });
    expect(ops.weekdayOcc).toHaveLength(7);
    expect(ops.weeks[0]).toMatchObject({ start: "2026-07-01", end: "2026-07-05", days: 5 });
    expect(ops.weeks.reduce((s, w) => s + w.days, 0)).toBe(31);
  });

  it("la venta promedio cuenta todas las noches vendidas, también las de una habitación hoy fuera de servicio", () => {
    // La habitación "r3" ya no está entre las disponibles, pero vendió 2 noches a 50.000 en julio.
    const withOutOfService = [
      ...reservations,
      { room_id: "r3", check_in: "2026-07-20", check_out: "2026-07-22", total_value: 100_000 },
    ];
    const o = monthOperations("2026-07", rooms, withOutOfService, payments, "2026-09-26");
    expect(o.soldNights).toBe(6);
    expect(o.soldRevenue).toBe(200_000);
    expect(o.adr).toBeCloseTo(200_000 / 6, 5);
    // La ocupación y el RevPAR siguen midiendo solo las habitaciones disponibles.
    expect(o.nightsSold).toBe(4);
    expect(o.occupancy).toBeCloseTo(4 / 62);
    expect(o.revpar).toBeCloseTo(100_000 / 62);
    // La venta promedio semanal también las incluye.
    const week = o.weeks.find((w) => w.start <= "2026-07-20" && w.end >= "2026-07-20")!;
    expect(week.adr).toBeCloseTo(50_000, 5);
  });

  it("una habitación fuera de servicio solo deja de contar mientras lo está", () => {
    const three = [...rooms, { id: "r3", name: "Pieza 6", room_type: "Baño compartido", display_order: 3 }];
    const sold = [
      ...reservations,
      { room_id: "r3", check_in: "2026-07-20", check_out: "2026-07-22", total_value: 100_000 },
    ];
    // r3 sale de servicio el 25 de julio y sigue fuera.
    const gaps = { r3: [{ from: "2026-07-25", to: null }] };
    const o = monthOperations("2026-07", three, sold, payments, "2026-09-26", gaps);
    const day = (d: string) => o.days.find((x) => x.date === d)!;
    expect(day("2026-07-20").capacity).toBe(3); // en servicio y con venta
    expect(day("2026-07-23").capacity).toBe(3); // en servicio, aunque sin venta ese día
    expect(day("2026-07-25").capacity).toBe(2); // fuera de servicio
    expect(o.roomNights).toBe(24 * 3 + 7 * 2); // del 1 al 24: 3 habitaciones; del 25 al 31: 2
    expect(o.occupancy).toBeCloseTo(6 / (24 * 3 + 7 * 2));
    expect(o.nightsSold).toBe(6);
    expect(o.adr).toBeCloseTo(200_000 / 6, 5);
    expect(o.rooms.map((r) => r.name)).toContain("Pieza 6");
  });

  it("una habitación fuera de servicio todo el período y sin ventas no aparece ni suma capacidad", () => {
    const three = [...rooms, { id: "r3", name: "Pieza 6", room_type: "Baño compartido", display_order: 3 }];
    const o = monthOperations("2026-07", three, reservations, payments, "2026-09-26", { r3: [{ from: "0000-01-01", to: null }] });
    expect(o.roomNights).toBe(62);
    expect(o.rooms.map((r) => r.name)).not.toContain("Pieza 6");
  });

  it("sin habitaciones fuera de servicio, soldNights y nightsSold coinciden", () => {
    expect(ops.soldNights).toBe(ops.nightsSold);
    expect(ops.soldRevenue).toBe(ops.revenue);
  });

  it("corta el mes en curso en el día de hoy", () => {
    expect(monthOperations("2026-09", rooms, [], [], "2026-09-10").elapsedDays).toBe(10);
    expect(previousMonth("2026-01")).toBe("2025-12");
  });

  it("calcula el punto de equilibrio y conclusiones", () => {
    const s = summary();
    const be = breakEven(s, ops);
    // 300.000 / (25.000 * (1 - 0,08)) = 13,04 noches
    expect(be.nights).toBeCloseTo(300_000 / (25_000 * 0.92));
    const lines = monthlyConclusions(s, ops, { summary: summary({ totals: { ...s.totals, profit: 400_000 } }), ops: null }, buildStatement(s));
    expect(lines[0]).toContain("+30,0% frente a junio");
    expect(lines.at(-1)).toContain("1 pago(s) pendiente(s)");
  });
});
