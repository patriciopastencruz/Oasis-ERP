import { describe, expect, it } from "vitest";
import {
  accumulatedMetrics,
  buildClosingProducts,
  cumulativeIncome,
  kgPerDay,
  productKind,
  type ClosingCatalogProduct,
} from "./closing-report";

const catalog: ClosingCatalogProduct[] = [
  { id: "c2", code: "ICE-2KG", name: "Hielo cubo 2 kg", presentation: "Bolsa 2 kg", ice_weight_kg: "2.000" },
  { id: "c1", code: "ICE-1KG", name: "Hielo cubo 1 kg", presentation: "Bolsa 1 kg", ice_weight_kg: "1.000" },
  { id: "f2", code: "FRAPPE-2KG", name: "Hielo frappé 2 kg", presentation: "Bolsa 2 kg", ice_weight_kg: "2.000" },
  { id: "f1", code: "FRAPPE-1KG", name: "Hielo frappé 1 kg", presentation: "Bolsa 1 kg", ice_weight_kg: "1.000" },
  { id: "w20", code: "WATER-20L", name: "Agua 20 litros", presentation: "Bidón 20 L", ice_weight_kg: "0.000" },
  { id: "w6", code: "WATER-6L", name: "Agua 6 litros", presentation: "Botella 6 L", ice_weight_kg: "0.000" },
];

describe("cierre diario de Distribuidora Altiplánica", () => {
  it("clasifica hielo cubo, frappé y agua", () => {
    expect(productKind(catalog[0])).toBe("cube");
    expect(productKind(catalog[2])).toBe("frappe");
    expect(productKind(catalog[4])).toBe("water");
  });

  it("agrupa todos los productos, ordena por peso y calcula kilos y promedios del mes", () => {
    const { groups } = buildClosingProducts(
      catalog,
      [
        { id: "c2", delivered_quantity: 100 },
        { id: "f2", delivered_quantity: 40 },
        { id: "w20", delivered_quantity: 12 },
      ],
      {
        days: 10,
        by_product: [
          { id: "c2", units: 800 },
          { id: "c1", units: 100 },
          { id: "w20", units: 50 },
        ],
      },
    );
    const [cube, frappe, water] = groups;
    expect(cube.items.map((r) => r.code)).toEqual(["ICE-1KG", "ICE-2KG"]); // 1k antes que 2k
    expect(cube.kg).toBe(200); // 100 bolsas de 2 kg
    expect(cube.items[0].units).toBe(0); // sin ventas ese día igual aparece
    expect(frappe.kg).toBe(80);
    expect(water.units).toBe(12);
    expect(water.items.find((r) => r.code === "WATER-6L")!.monthAvgPerDay).toBe(0);
    expect(water.items.find((r) => r.code === "WATER-20L")!.monthAvgPerDay).toBe(5); // 50 en 10 días
    expect(cube.items.find((r) => r.code === "ICE-2KG")!.monthAvgPerDay).toBe(80);
  });

  it("separa lo entregado de lo pedido que aún no se entrega", () => {
    const { groups } = buildClosingProducts(
      catalog,
      [
        { id: "c2", delivered_quantity: 180, planned_quantity: 280 },
        { id: "f2", delivered_quantity: 60, planned_quantity: 60 },
      ],
      { days: 15, by_product: [] },
    );
    expect(groups[0].kg).toBe(360); // solo lo entregado cuenta como vendido
    expect(groups[0].pendingKg).toBe(200); // 100 bolsas de 2 kg por entregar
    expect(groups[1].pendingKg).toBe(0);
  });

  it("el promedio de kilos del mes suma cubo y frappé entre los días corridos", () => {
    const m = accumulatedMetrics({
      month_start: "2026-10-01",
      days: 15,
      income: 3_711_606,
      kg_cube: 8527,
      kg_frappe: 2430,
      daily: [],
      by_product: [],
    });
    expect(m.totalKg).toBe(10957);
    expect(m.avgKgPerDay).toBeCloseTo(730.47, 2);
    expect(m.income).toBe(3_711_606);
  });

  it("el ingreso se acumula día a día y los kilos separan cubo y frappé", () => {
    const daily = [
      { date: "2026-10-01", kg_cube: 100, kg_frappe: 20, sales: 1000 },
      { date: "2026-10-02", kg_cube: 0, kg_frappe: 0, sales: 0 },
      { date: "2026-10-03", kg_cube: 50, kg_frappe: 10, sales: 500 },
    ];
    expect(cumulativeIncome(daily).map((d) => d.cumulative)).toEqual([1000, 1000, 1500]);
    expect(kgPerDay(daily).map((d) => d.total)).toEqual([120, 0, 60]);
  });
});
