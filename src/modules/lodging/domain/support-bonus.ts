/**
 * Bono de apoyo transversal: una persona trabaja de noche de lunes a viernes y
 * apoya a los 3 hostales. 15 puntos salen del resultado conjunto de los hostales
 * (lo que ganan las recepciones sobre el máximo posible) y 85 de su propia
 * gestión, todos de forma proporcional: reservas que crea de noche (65, según la
 * meta de cada hostal), cierres que hace (10) y pagos que registra (10).
 */

export const SUPPORT_GROUP_WEIGHT = 15;
/** Peso de las reservas de noche por hostal; Cobija pesa menos porque se espera menos volumen. */
export const SUPPORT_UNIT_WEIGHTS: Record<string, number> = { HOC: 24, HU: 24, HOB: 17 };
export const SUPPORT_CLOSING_WEIGHT = 5;
export const SUPPORT_PAYMENT_WEIGHT = 5;
/** La noche empieza a las 19:00 y termina a las 06:00 del día siguiente. */
export const NIGHT_STARTS_AT_HOUR = 19;
export const NIGHT_ENDS_AT_HOUR = 6;

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

const shiftDate = (date: string, delta: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

/** Lunes a viernes (día de la fecha, sin hora). */
export const isWeekday = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
};

/**
 * Noche de trabajo a la que pertenece una creación: de 19:00 a 06:00 del día
 * siguiente, atribuida al día en que empezó la noche (una reserva del sábado a
 * las 02:00 es de la noche del viernes). Devuelve null si fue de día.
 */
export function nightShiftDay(createdAtIso: string) {
  const { date, hour } = dayParts(createdAtIso);
  if (hour >= NIGHT_STARTS_AT_HOUR) return date;
  if (hour < NIGHT_ENDS_AT_HOUR) return shiftDate(date, -1);
  return null;
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
 * persona de apoyo en una noche de lunes a viernes dentro del rango del mes.
 */
export function countNightReservations(
  reservations: { created_at: string; business_unit_id: string }[],
  from: string,
  to: string,
) {
  const byUnit = new Map<string, number>();
  for (const r of reservations) {
    const day = nightShiftDay(r.created_at);
    if (day === null || day < from || day > to || !isWeekday(day)) continue;
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
  /** Reservas nocturnas creadas por la persona de apoyo y meta del mes. */
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
   * Cierres de los hostales que ella emitió en el mes (de lunes a viernes), sobre los que debía hacer
   * (uno por hostal por día laborable), y cuántos estuvieron a tiempo.
   */
  closings: { expected: number; issued: number; onTime: number } | null;
  /** Pagos por transferencia o tarjeta que registró de noche: con comprobante y con diferencia marcada. */
  payments: { total: number; withReceipt: number; withDifference: number } | null;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function computeSupportBonus(input: SupportInput) {
  const group = groupPoints(input.hostales);
  const rows: SupportRow[] = [];
  const add = (key: string, label: string, weight: number, ratio: number, text: string) =>
    rows.push({ key, label, weight, effectiveWeight: weight, earned: weight * Math.min(Math.max(ratio, 0), 1), text });

  if (group !== null)
    add("group", "Resultado conjunto de los hostales", SUPPORT_GROUP_WEIGHT, group / 100, `${(Math.round(group * 10) / 10).toLocaleString("es-CL")} de 100 puntos en conjunto`);
  for (const h of input.hostales) {
    if (h.goal <= 0) continue;
    add(h.code, `Reservas de noche en ${h.name}`, SUPPORT_UNIT_WEIGHTS[h.code] ?? 17, h.created / h.goal, `${h.created} de ${h.goal} reservas (${pct(Math.min(h.created / h.goal, 1))})`);
  }
  const c = input.closings;
  if (c && c.expected > 0) {
    add("closings_done", "Cierres de los hostales hechos por ella", SUPPORT_CLOSING_WEIGHT, c.issued / c.expected, `${c.issued} de ${c.expected} cierres (${pct(Math.min(c.issued / c.expected, 1))})`);
    const onTime = c.issued > 0 ? c.onTime / c.issued : 0;
    add("closings_on_time", "Cierres a tiempo", SUPPORT_CLOSING_WEIGHT, onTime, `${c.onTime} de ${c.issued} antes de las 06:00 (${pct(onTime)})`);
  }
  const p = input.payments;
  if (p && p.total > 0) {
    add("payments_receipt", "Pagos de noche con comprobante", SUPPORT_PAYMENT_WEIGHT, p.withReceipt / p.total, `${p.withReceipt} de ${p.total} pagos por transferencia o tarjeta (${pct(p.withReceipt / p.total)})`);
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
  const amount = weight > 0 ? Math.round((input.pool * points) / 100) : 0;
  return { rows, points, amount, groupPoints: group };
}

export type SupportResult = ReturnType<typeof computeSupportBonus>;
