type DayTotals = { occupied: number; revenue: number } | null | undefined;

/** Variación porcentual; null si falta alguno de los dos valores o el anterior es 0. */
export function pctChange(now: number | null | undefined, before: number | null | undefined) {
  if (now === null || now === undefined || before === null || before === undefined || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

/** Venta promedio y RevPAR de un día (venta devengada del día). */
export function dayIndicators(day: DayTotals, totalRooms: number) {
  if (!day) return { adr: null, revpar: null };
  return {
    adr: day.occupied > 0 ? day.revenue / day.occupied : null,
    revpar: totalRooms > 0 ? day.revenue / totalRooms : null,
  };
}

export type IndicatorChange = { now: number | null; before: number | null; pct: number | null };

const change = (now: number | null, before: number | null): IndicatorChange => ({ now, before, pct: pctChange(now, before) });

/**
 * Cómo se movieron la venta promedio y el RevPAR respecto del día anterior:
 *  - `day`: el último día (hoy, en vivo) frente a ayer, cada uno por sí solo.
 *  - `cumulative`: el acumulado del mes hasta hoy frente al acumulado hasta ayer
 *    (cuánto movió el día de hoy el indicador del mes).
 * Todo en null si no hay un día anterior para comparar.
 */
export function dayOverDay(input: {
  today: DayTotals;
  yesterday: DayTotals;
  totalRooms: number;
  cumulativeNow: { adr: number | null; revpar: number | null };
  cumulativeBefore: { adr: number | null; revpar: number | null } | null;
}) {
  const t = dayIndicators(input.today, input.totalRooms);
  const y = dayIndicators(input.yesterday, input.totalRooms);
  const hasYesterday = Boolean(input.yesterday);
  return {
    available: hasYesterday,
    day: {
      adr: change(t.adr, hasYesterday ? y.adr : null),
      revpar: change(t.revpar, hasYesterday ? y.revpar : null),
    },
    cumulative: {
      adr: change(input.cumulativeNow.adr, input.cumulativeBefore?.adr ?? null),
      revpar: change(input.cumulativeNow.revpar, input.cumulativeBefore?.revpar ?? null),
    },
  };
}
export type DayOverDay = ReturnType<typeof dayOverDay>;
