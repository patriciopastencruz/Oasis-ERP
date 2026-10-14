import type { ReviewCategoryKey } from "./review-scores";

/** Metas de un hostal para el reporte semanal (null = sin meta). */
export type ReportGoals = {
  occupancyPct: number | null;
  averageRate: number | null;
  bookingScore: number | null;
  categories: Partial<Record<ReviewCategoryKey, number>>;
};

export const emptyGoals: ReportGoals = { occupancyPct: null, averageRate: null, bookingScore: null, categories: {} };

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function goalsFromRow(row: {
  occupancy_pct: number | string | null;
  average_rate: number | string | null;
  booking_score: number | string | null;
  booking_categories: unknown;
} | null): ReportGoals {
  if (!row) return emptyGoals;
  const cats: ReportGoals["categories"] = {};
  for (const [k, v] of Object.entries((row.booking_categories ?? {}) as Record<string, unknown>)) {
    const n = num(v);
    if (n !== null && Number.isFinite(n)) cats[k as ReviewCategoryKey] = n;
  }
  return { occupancyPct: num(row.occupancy_pct), averageRate: num(row.average_rate), bookingScore: num(row.booking_score), categories: cats };
}

/** Meta de RevPAR: venta promedio meta × ocupación meta. */
export function revparGoal(goals: ReportGoals) {
  return goals.averageRate !== null && goals.occupancyPct !== null ? Math.round((goals.averageRate * goals.occupancyPct) / 100) : null;
}

/** null si no hay meta; true si el valor la alcanza o supera. */
export function goalMet(value: number | null | undefined, target: number | null | undefined) {
  if (target === null || target === undefined || value === null || value === undefined) return null;
  return value + 1e-9 >= target;
}
