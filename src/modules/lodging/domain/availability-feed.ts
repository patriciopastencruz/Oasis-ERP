import { addDays } from "./daily-closing";

/**
 * Calendario de disponibilidad de los 3 hostales para asistentes externos
 * (por ejemplo el asistente de reservas de WhatsApp). Agrupa las habitaciones
 * por tipo y entrega, para cada tipo, cuántas están libres cada noche, comprimido
 * en tramos de igual cantidad. No incluye datos de huéspedes.
 */

export const FEED_HOSTALS: Record<string, { name: string; breakfast: boolean; link?: string }> = {
  HU: { name: "Hostal Atacama Oasis (Uruguay)", breakfast: false, link: "https://www.oasis-erp.cl/reservar/hostal-uruguay" },
  HOC: { name: "Hostal Oasis Modulares (Centro)", breakfast: false },
  HOB: { name: "Hostal Oasis Cobija", breakfast: true },
};

export type FeedRoom = {
  id: string;
  unitCode: string;
  name: string;
  roomType: string;
  capacity: number;
  baseRate: number;
};
export type FeedBooking = { room_id: string; check_in: string; check_out: string };
export type FreeRun = { from: string; to: string; free: number };

/** Cantidad de habitaciones libres cada noche, desde `from` durante `days` noches. */
export function freeRoomsPerNight(roomIds: string[], bookings: FeedBooking[], from: string, days: number) {
  const ids = new Set(roomIds);
  const busy: Map<string, Set<string>> = new Map(roomIds.map((id) => [id, new Set<string>()]));
  const last = addDays(from, days);
  for (const b of bookings) {
    if (!ids.has(b.room_id)) continue;
    // Las noches ocupadas van desde la entrada hasta la víspera de la salida.
    for (let d = b.check_in < from ? from : b.check_in; d < b.check_out && d < last; d = addDays(d, 1)) busy.get(b.room_id)!.add(d);
  }
  const nights: { date: string; free: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    nights.push({ date, free: roomIds.filter((id) => !busy.get(id)!.has(date)).length });
  }
  return nights;
}

/** Une noches consecutivas con la misma cantidad de habitaciones libres: `to` es el día de salida del tramo. */
export function compressRuns(nights: { date: string; free: number }[]): FreeRun[] {
  const runs: FreeRun[] = [];
  for (const n of nights) {
    const prev = runs.at(-1);
    if (prev && prev.free === n.free) prev.to = addDays(n.date, 1);
    else runs.push({ from: n.date, to: addDays(n.date, 1), free: n.free });
  }
  return runs;
}

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};

export function describeRuns(runs: FreeRun[]) {
  return runs
    .map((r) => `noches del ${dayLabel(r.from)} al ${dayLabel(addDays(r.to, -1))}: ${r.free} libre${r.free === 1 ? "" : "s"}`)
    .join("; ");
}

const clpText = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/**
 * Un registro por hostal y tipo de habitación (tipo, capacidad y tarifa iguales), con las noches
 * libres de los próximos `days` días a partir de `today`.
 */
export function buildAvailabilityFeed(input: { rooms: FeedRoom[]; bookings: FeedBooking[]; today: string; days: number; updatedAt: string }) {
  const groups = new Map<string, FeedRoom[]>();
  for (const r of input.rooms) {
    const key = `${r.unitCode}|${r.roomType}|${r.capacity}|${r.baseRate}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const lastNight = addDays(input.today, input.days - 1);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rooms]) => {
      const hostal = FEED_HOSTALS[rooms[0].unitCode] ?? { name: rooms[0].unitCode, breakfast: false };
      const nights = freeRoomsPerNight(
        rooms.map((r) => r.id),
        input.bookings,
        input.today,
        input.days,
      );
      const runs = compressRuns(nights);
      const cap = rooms[0].capacity;
      const people = cap === 1 ? "1 persona" : `hasta ${cap} personas`;
      const title = `Disponibilidad - ${hostal.name} - ${rooms[0].roomType} (${people})`;
      return {
        id: key.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase(),
        name: title,
        category: hostal.name,
        price: rooms[0].baseRate,
        currency: "CLP",
        description:
          `${hostal.name}: ${rooms.length} ${rooms.length === 1 ? "habitación" : "habitaciones"} tipo ${rooms[0].roomType} para ${people}, ` +
          `tarifa base ${clpText(rooms[0].baseRate)} por noche${hostal.breakfast ? " con desayuno incluido" : " (sin desayuno)"}. ` +
          `Check-in desde las 14:00 y check-out a las 12:00. ` +
          `Habitaciones libres cada noche entre el ${dayLabel(input.today)} y el ${dayLabel(lastNight)} (de ${rooms.length} en total): ${describeRuns(runs)}. ` +
          `Para unas fechas, quedan libres tantas habitaciones como el mínimo de las noches entre la entrada y la víspera de la salida. ` +
          `Calendario actualizado el ${input.updatedAt}; la reserva final la confirma recepción.`,
        total_rooms: rooms.length,
        capacity: cap,
        free_runs: runs.map((r) => ({ from: r.from, to_checkout: r.to, free: r.free })),
        ...(hostal.link ? { link: hostal.link } : {}),
      };
    });
}
