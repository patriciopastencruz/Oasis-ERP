/**
 * Piezas puras del cierre diario de Distribuidora Altiplánica: agrupa los
 * productos (hielo cubo, frappé y aguas), calcula los promedios del mes a la
 * fecha y arma las series del gráfico de kilos por día y del ingreso acumulado.
 */

export type ClosingProductKind = "cube" | "frappe" | "water";

export const closingGroupLabels: Record<ClosingProductKind, string> = {
  cube: "Hielo cubo",
  frappe: "Hielo frappé",
  water: "Agua",
};

export type ClosingCatalogProduct = {
  id: string;
  code: string;
  name: string;
  presentation: string;
  ice_weight_kg: number | string;
};

export type ClosingDayProduct = { id: string; delivered_quantity: number };

export type ClosingAccumulated = {
  month_start: string;
  /** Días corridos del mes hasta la fecha del cierre (incluida). */
  days: number;
  income: number;
  kg_cube: number;
  kg_frappe: number;
  daily: { date: string; kg_cube: number; kg_frappe: number; sales: number }[];
  by_product: { id: string; units: number }[];
};

export type ClosingProductRow = {
  id: string;
  code: string;
  name: string;
  presentation: string;
  kind: ClosingProductKind;
  iceWeightKg: number;
  /** Unidades entregadas en el día. */
  units: number;
  /** Kilos del día (unidades × peso del producto); 0 para las aguas. */
  kg: number;
  /** Unidades entregadas en el mes hasta la fecha. */
  monthUnits: number;
  /** Promedio diario del mes a la fecha (unidades por día). */
  monthAvgPerDay: number;
};

/** Hielo con peso: frappé si el nombre lo dice, si no cubo; sin peso es agua. */
export function productKind(product: { name: string; ice_weight_kg: number | string }): ClosingProductKind {
  if (Number(product.ice_weight_kg) <= 0) return "water";
  return /frapp/i.test(product.name) ? "frappe" : "cube";
}

const groupOrder: ClosingProductKind[] = ["cube", "frappe", "water"];

/**
 * Todos los productos activos agrupados (cubo, frappé, agua), aunque no hayan
 * vendido nada ese día, con lo entregado en el día y el promedio del mes.
 */
export function buildClosingProducts(
  catalog: ClosingCatalogProduct[],
  dayProducts: ClosingDayProduct[],
  accumulated: Pick<ClosingAccumulated, "days" | "by_product">,
) {
  const dayUnits = new Map(dayProducts.map((p) => [p.id, Number(p.delivered_quantity)]));
  const monthUnits = new Map(accumulated.by_product.map((p) => [p.id, Number(p.units)]));
  const days = Math.max(accumulated.days, 1);
  const rows: ClosingProductRow[] = catalog.map((p) => {
    const iceWeightKg = Number(p.ice_weight_kg);
    const units = dayUnits.get(p.id) ?? 0;
    const month = monthUnits.get(p.id) ?? 0;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      presentation: p.presentation,
      kind: productKind(p),
      iceWeightKg,
      units,
      kg: units * iceWeightKg,
      monthUnits: month,
      monthAvgPerDay: month / days,
    };
  });
  const groups = groupOrder.map((kind) => {
    const items = rows
      .filter((r) => r.kind === kind)
      .sort((a, b) => (kind === "water" ? 0 : a.iceWeightKg - b.iceWeightKg));
    return {
      kind,
      label: closingGroupLabels[kind],
      items,
      units: items.reduce((s, r) => s + r.units, 0),
      kg: items.reduce((s, r) => s + r.kg, 0),
    };
  });
  return { groups, rows };
}

/** Totales y promedios del mes a la fecha. El promedio de kilos incluye cubo y frappé. */
export function accumulatedMetrics(accumulated: ClosingAccumulated) {
  const days = Math.max(accumulated.days, 1);
  const totalKg = Number(accumulated.kg_cube) + Number(accumulated.kg_frappe);
  return {
    days,
    income: Number(accumulated.income),
    totalKg,
    avgKgPerDay: totalKg / days,
    kgCube: Number(accumulated.kg_cube),
    kgFrappe: Number(accumulated.kg_frappe),
    avgKgCubePerDay: Number(accumulated.kg_cube) / days,
    avgKgFrappePerDay: Number(accumulated.kg_frappe) / days,
    avgIncomePerDay: Number(accumulated.income) / days,
  };
}

/** Ingreso acumulado día a día del mes. */
export function cumulativeIncome(daily: { date: string; sales: number }[]) {
  let running = 0;
  return daily.map((d) => {
    running += Number(d.sales);
    return { date: d.date, daily: Number(d.sales), cumulative: running };
  });
}

export type KgDay = { date: string; cube: number; frappe: number; total: number };

/** Kilos de hielo por día, separando cubo y frappé. */
export function kgPerDay(daily: ClosingAccumulated["daily"]): KgDay[] {
  return daily.map((d) => ({
    date: d.date,
    cube: Number(d.kg_cube),
    frappe: Number(d.kg_frappe),
    total: Number(d.kg_cube) + Number(d.kg_frappe),
  }));
}
