import { addDays } from "./daily-closing";

type Stay = { room_id: string; check_in: string; check_out: string };

const nightsOf = (s: Stay) =>
  Math.max(
    1,
    Math.round(
      (Date.parse(`${s.check_out}T12:00:00Z`) - Date.parse(`${s.check_in}T12:00:00Z`)) /
        86_400_000,
    ),
  );

/**
 * Estadía promedio: noches por reserva, de las reservas cuya llegada cae en el
 * rango (inclusive). Devuelve null si no hubo llegadas.
 */
export function averageStay(stays: Stay[], rangeStart: string, rangeEnd: string) {
  const arrivals = stays.filter((s) => s.check_in >= rangeStart && s.check_in <= rangeEnd);
  if (!arrivals.length) return { average: null, reservations: 0 };
  const nights = arrivals.reduce((sum, s) => sum + nightsOf(s), 0);
  return { average: nights / arrivals.length, reservations: arrivals.length };
}

/**
 * Ocupación futura: porcentaje de noches-habitación ya reservadas en los
 * próximos N días (contando `fromIso` como el primer día), sobre las
 * habitaciones vendibles. Cada habitación cuenta una vez por noche aunque
 * tenga más de una reserva superpuesta.
 */
export function futureOccupancy(
  stays: Stay[],
  sellableRoomIds: Set<string>,
  fromIso: string,
  windows: number[],
) {
  const total = sellableRoomIds.size;
  const horizon = Math.max(...windows);
  const occupied: number[] = Array.from({ length: horizon }, () => 0);
  const perDay = new Map<string, Set<string>>();
  for (const s of stays) {
    if (!sellableRoomIds.has(s.room_id)) continue;
    let d = s.check_in < fromIso ? fromIso : s.check_in;
    while (d < s.check_out && d < addDays(fromIso, horizon)) {
      const set = perDay.get(d) ?? new Set<string>();
      set.add(s.room_id);
      perDay.set(d, set);
      d = addDays(d, 1);
    }
  }
  for (let i = 0; i < horizon; i++) occupied[i] = perDay.get(addDays(fromIso, i))?.size ?? 0;
  return windows.map((days) => {
    const nights = occupied.slice(0, days).reduce((a, b) => a + b, 0);
    return {
      days,
      nights,
      available: total * days,
      pct: total ? nights / (total * days) : 0,
    };
  });
}

type CancellationStay = Stay & {
  status: string;
  origin: string;
  total_value: number;
};

export type CancellationRow = {
  origin: string;
  reservations: number;
  cancelled: number;
  lostNights: number;
  lostValue: number;
};

const IGNORED = new Set(["conflict", "review_required"]);

/**
 * Cancelaciones de las reservas con llegada en el rango. Una cancelada cuya
 * habitación y fechas volvieron a venderse (cambio de fechas o de huésped, o
 * una reserva nueva en su lugar) no cuenta como noche perdida: se cancela pero
 * la venta no se perdió. `stays` debe traer también las reservas vecinas del
 * rango, para poder detectar ese reemplazo.
 */
export function cancellationStats(stays: CancellationStay[], rangeStart: string, rangeEnd: string) {
  const live = stays.filter((s) => s.status !== "cancelled" && !IGNORED.has(s.status));
  const cohort = stays.filter(
    (s) => !IGNORED.has(s.status) && s.check_in >= rangeStart && s.check_in <= rangeEnd,
  );
  const rows = new Map<string, CancellationRow>();
  let replaced = 0;
  for (const s of cohort) {
    const row = rows.get(s.origin) ?? { origin: s.origin, reservations: 0, cancelled: 0, lostNights: 0, lostValue: 0 };
    row.reservations += 1;
    if (s.status === "cancelled") {
      row.cancelled += 1;
      const wasReplaced = live.some(
        (o) => o.room_id === s.room_id && o.check_in < s.check_out && o.check_out > s.check_in,
      );
      if (wasReplaced) replaced += 1;
      else {
        row.lostNights += nightsOf(s);
        row.lostValue += Number(s.total_value) || 0;
      }
    }
    rows.set(s.origin, row);
  }
  const list = [...rows.values()];
  const reservations = list.reduce((a, r) => a + r.reservations, 0);
  const cancelled = list.reduce((a, r) => a + r.cancelled, 0);
  return {
    reservations,
    cancelled,
    replaced,
    rate: reservations ? cancelled / reservations : 0,
    lostNights: list.reduce((a, r) => a + r.lostNights, 0),
    lostValue: list.reduce((a, r) => a + r.lostValue, 0),
    byOrigin: list,
  };
}
