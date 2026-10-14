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
