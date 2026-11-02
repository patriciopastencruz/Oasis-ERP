import { MAX_MISSED_INDICATORS, isWeekendDay } from "./reception-bonus";

/**
 * Bono de apoyo transversal: una persona apoya a los 3 hostales de lunes a viernes de 19:00 a 24:00 y
 * sábado y domingo de 09:00 a 19:00. 15 puntos salen del resultado de recepción del hostal de
 * referencia (Centro) medido solo con sus sábados y domingos (lo que gana su recepción sobre el máximo
 * posible) y 85 de su propia gestión dentro de su horario, todos de forma proporcional: reservas que
 * crea (65, según la meta de cada hostal), cierres que hace (10) y pagos que registra (10). Si en el
 * hostal de referencia 3 o más de los 6 indicadores no se cumplen, no hay bono.
 */

export const SUPPORT_GROUP_WEIGHT = 15;
/** Hostal cuyos 6 indicadores de recepción evalúan a la persona de apoyo. */
export const SUPPORT_REFERENCE_UNIT = "HOC";
/** Peso de las reservas de noche por hostal; Cobija pesa menos porque se espera menos volumen. */
export const SUPPORT_UNIT_WEIGHTS: Record<string, number> = { HOC: 24, HU: 24, HOB: 17 };
export const SUPPORT_CLOSING_WEIGHT = 5;
export const SUPPORT_PAYMENT_WEIGHT = 5;
/** Horario de la persona de apoyo (hora de Santiago, la hora de término no entra). */
export const SUPPORT_WEEKDAY_SHIFT = { from: 19, to: 24 };
export const SUPPORT_WEEKEND_SHIFT = { from: 9, to: 19 };

export type SupportGoals = {
  HOC: { per_month: number };
  HU: { per_month: number };
  HOB: { per_month: number };
};
export const DEFAULT_SUPPORT_GOALS: SupportGoals = { HOC: { per_month: 15 }, HU: { per_month: 15 }, HOB: { per_month: 15 } };

const dayParts = (iso: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

/** Lunes a viernes (día de la fecha, sin hora). */
export const isWeekday = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
};

/**
 * Día de trabajo al que pertenece un registro hecho por la persona de apoyo, o null si fue fuera de su
 * horario: lunes a viernes de 19:00 a 24:00 y sábado y domingo de 09:00 a 19:00.
 */
export function supportShiftDay(atIso: string) {
  const { date, hour } = dayParts(atIso);
  const shift = isWeekendDay(date) ? SUPPORT_WEEKEND_SHIFT : SUPPORT_WEEKDAY_SHIFT;
  return hour >= shift.from && hour < shift.to ? date : null;
}

/** Hasta la 01:00 de la madrugada siguiente a un turno de lunes a viernes se puede terminar el cierre. */
export const SUPPORT_CLOSING_GRACE_END_HOUR = 1;

/**
 * Como `supportShiftDay`, pero para emitir cierres: además del turno vale la hora siguiente a un turno de
 * lunes a viernes (00:00 a 01:00), a veces ella se queda más tarde para terminarlos.
 */
export function supportClosingShiftDay(atIso: string) {
  const day = supportShiftDay(atIso);
  if (day !== null) return day;
  const { date, hour } = dayParts(atIso);
  if (hour >= SUPPORT_CLOSING_GRACE_END_HOUR) return null;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const previous = d.toISOString().slice(0, 10);
  return isWeekday(previous) ? previous : null;
}

/** Cantidad de días de lunes a viernes de un mes (YYYY-MM). */
export function weekdaysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= days; d++) if (isWeekday(`${month}-${String(d).padStart(2, "0")}`)) count++;
  return count;
}

/** Meta mensual de reservas nocturnas de un hostal. */
export function monthlyGoal(code: string, goals: SupportGoals) {
  const perMonth = code === "HOB" ? goals.HOB.per_month : code === "HU" ? goals.HU.per_month : goals.HOC.per_month;
  return Math.round(perMonth);
}

/**
 * Cuántas reservas cuentan para la meta de cada hostal: las creadas por la
 * persona de apoyo dentro de su horario en el rango del mes.
 */
export function countShiftReservations(
  reservations: { created_at: string; business_unit_id: string }[],
  from: string,
  to: string,
) {
  const byUnit = new Map<string, number>();
  for (const r of reservations) {
    const day = supportShiftDay(r.created_at);
    if (day === null || day < from || day > to) continue;
    byUnit.set(r.business_unit_id, (byUnit.get(r.business_unit_id) ?? 0) + 1);
  }
  return byUnit;
}

export type SupportHostalInput = {
  code: string;
  name: string;
  /** Bono de recepción máximo y puntos del hostal (0 a 100). */
  pool: number;
  points: number;
  /** Indicadores de recepción sin cumplir en el mes. */
  missed?: number;
  /** Reservas creadas por la persona de apoyo dentro de su horario y meta del mes. */
  created: number;
  goal: number;
};

export type SupportRow = {
  key: string;
  label: string;
  weight: number;
  effectiveWeight: number;
  earned: number;
  text: string;
};

/** Puntos conjuntos de los hostales: lo ganado en recepción sobre el máximo posible, de 0 a 100. */
export function groupPoints(hostales: { pool: number; points: number }[]) {
  const total = hostales.reduce((s, h) => s + h.pool, 0);
  if (total <= 0) return null;
  return (hostales.reduce((s, h) => s + (h.pool * Math.min(Math.max(h.points, 0), 100)) / 100, 0) / total) * 100;
}

export type SupportInput = {
  pool: number;
  hostales: SupportHostalInput[];
  /**
   * Cierres de los hostales que ella emitió en el mes dentro de su horario (de días lunes a viernes), sobre los que debía hacer
   * (uno por hostal por día laborable), y cuántos estuvieron a tiempo.
   */
  closings: { expected: number; issued: number; onTime: number } | null;
  /** Pagos por transferencia o tarjeta que registró dentro de su horario: con comprobante y con diferencia marcada. */
  payments: { total: number; withReceipt: number; withDifference: number } | null;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function computeSupportBonus(input: SupportInput) {
  const reference = input.hostales.find((h) => h.code === SUPPORT_REFERENCE_UNIT);
  const group = reference ? groupPoints([reference]) : null;
  const missedCount = reference?.missed ?? 0;
  const blockedByMisses = missedCount >= MAX_MISSED_INDICATORS;
  const rows: SupportRow[] = [];
  const add = (key: string, label: string, weight: number, ratio: number, text: string) =>
    rows.push({ key, label, weight, effectiveWeight: weight, earned: weight * Math.min(Math.max(ratio, 0), 1), text });

  if (group !== null)
    add(
      "group",
      `Resultado de recepción en ${reference?.name ?? "el hostal de referencia"} (sábados y domingos)`,
      SUPPORT_GROUP_WEIGHT,
      group / 100,
      `${(Math.round(group * 10) / 10).toLocaleString("es-CL")} de 100 puntos de recepción · ${missedCount} de 6 indicadores sin cumplir`,
    );
  for (const h of input.hostales) {
    if (h.goal <= 0) continue;
    add(h.code, `Reservas en su horario en ${h.name}`, SUPPORT_UNIT_WEIGHTS[h.code] ?? 17, h.created / h.goal, `${h.created} de ${h.goal} reservas (${pct(Math.min(h.created / h.goal, 1))})`);
  }
  const c = input.closings;
  if (c && c.expected > 0) {
    add("closings_done", "Cierres de los hostales hechos por ella", SUPPORT_CLOSING_WEIGHT, c.issued / c.expected, `${c.issued} de ${c.expected} cierres (${pct(Math.min(c.issued / c.expected, 1))})`);
    const onTime = c.issued > 0 ? c.onTime / c.issued : 0;
    add("closings_on_time", "Cierres a tiempo", SUPPORT_CLOSING_WEIGHT, onTime, `${c.onTime} de ${c.issued} antes de las 06:00 (${pct(onTime)})`);
  }
  const p = input.payments;
  if (p && p.total > 0) {
    add("payments_receipt", "Pagos en su horario con comprobante", SUPPORT_PAYMENT_WEIGHT, p.withReceipt / p.total, `${p.withReceipt} de ${p.total} pagos por transferencia o tarjeta (${pct(p.withReceipt / p.total)})`);
    // Sin comprobantes no hay nada que revisar y cuenta como no cumplido.
    const clean = p.withReceipt > 0 ? (p.withReceipt - p.withDifference) / p.withReceipt : 0;
    add("payments_clean", "Comprobantes sin diferencia", SUPPORT_PAYMENT_WEIGHT, clean, `${Math.max(p.withReceipt - p.withDifference, 0)} de ${p.withReceipt} comprobantes sin diferencia (${pct(clean)})`);
  }

  const weight = rows.reduce((s, r) => s + r.weight, 0);
  // Una parte sin datos (sin cierres, sin pagos o sin meta) se deja fuera y su peso se reparte entre las demás.
  if (weight > 0 && weight !== 100)
    for (const r of rows) {
      r.effectiveWeight = (r.weight / weight) * 100;
      r.earned = r.earned * (r.effectiveWeight / r.weight);
    }
  const points = rows.reduce((s, r) => s + r.earned, 0);
  const amountBeforeBlock = weight > 0 ? Math.round((input.pool * points) / 100) : 0;
  const amount = blockedByMisses ? 0 : amountBeforeBlock;
  return { rows, points, amount, amountBeforeBlock, groupPoints: group, missedCount, blockedByMisses };
}

export type SupportResult = ReturnType<typeof computeSupportBonus>;
