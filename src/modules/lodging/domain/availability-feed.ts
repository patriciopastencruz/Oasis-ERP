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
  /** Descripción de la habitación (camas, baño, extras); puede venir en mayúsculas. */
  description?: string | null;
  /** Precio por noche según la cantidad de personas ({"1": 27000, "2": 32000}); si falta, rige la tarifa base. */
  ratesByGuests?: Record<string, number> | null;
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

const monthShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "20-oct": fácil de cruzar con "20 de octubre". */
const nightLabel = (iso: string) => `${Number(iso.slice(8))}-${monthShort[Number(iso.slice(5, 7)) - 1]}`;

/** Habitaciones libres noche por noche: "20-oct: 1; 21-oct: 2". */
export function describeNights(nights: { date: string; free: number }[]) {
  return nights.map((n) => `${nightLabel(n.date)}: ${n.free}`).join("; ");
}

export function describeRuns(runs: FreeRun[]) {
  return runs
    .map((r) => `noches del ${dayLabel(r.from)} al ${dayLabel(addDays(r.to, -1))}: ${r.free} libre${r.free === 1 ? "" : "s"}`)
    .join("; ");
}

const clpText = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/** "MINI DEPTOS 1C MATRIMONIAL, TV Y BAÑO PRIVADO" → "Mini deptos 1 cama matrimonial, TV y baño privado". */
export function normalizeDescription(text: string) {
  const lower = text
    .trim()
    .toLowerCase()
    .replace(/\bhab\.?\s/g, "habitación ")
    .replace(/\b1\s?c\b/g, "1 cama")
    .replace(/\b(\d)\s?c\b/g, "$1 camas")
    .replace(/\btv\b/g, "TV");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Precios por cantidad de personas, ordenados: [[1, 27000], [2, 32000]]. */
const sortedRates = (rates?: Record<string, number> | null) =>
  Object.entries(rates ?? {})
    .map(([n, v]) => [Number(n), Number(v)] as const)
    .filter(([n, v]) => n > 0 && v > 0)
    .sort((a, b) => a[0] - b[0]);

/** Nombre de la opción: la descripción si ya nombra el tipo ("Habitación simple 1 cama…"); si no, tipo y descripción. */
function optionLabel(room: FeedRoom) {
  const description = room.description ? normalizeDescription(room.description) : "";
  if (!description) return room.roomType;
  const firstWord = room.roomType.split(/\s+/)[0].toLowerCase().slice(0, 4);
  return description.toLowerCase().includes(firstWord) ? description : `${room.roomType} (${description.charAt(0).toLowerCase()}${description.slice(1)})`;
}

/**
 * Un registro por hostal y tipo de habitación (tipo, capacidad y tarifa iguales), con las noches
 * libres de los próximos `days` días a partir de `today`.
 */
export function buildAvailabilityFeed(input: { rooms: FeedRoom[]; bookings: FeedBooking[]; today: string; days: number; updatedAt: string }) {
  const groups = new Map<string, FeedRoom[]>();
  for (const r of input.rooms) {
    const key = `${r.unitCode}|${r.roomType}|${r.capacity}|${r.baseRate}|${r.description ?? ""}|${JSON.stringify(sortedRates(r.ratesByGuests))}`;
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
      // "Para 1 a 2 personas": una habitación de capacidad 2 también sirve para 1 persona.
      const people = cap === 1 ? "1 persona" : `1 a ${cap} personas`;
      const label = optionLabel(rooms[0]);
      const rates = sortedRates(rooms[0].ratesByGuests);
      const priceText = rates.length
        ? `precio por noche según la cantidad de personas: ${rates.map(([n, v]) => `${n} ${n === 1 ? "persona" : "personas"} ${clpText(v)}`).join(", ")}`
        : `tarifa ${clpText(rooms[0].baseRate)} por noche`;
      const title = `Disponibilidad - ${hostal.name} - ${label} (${people})`;
      return {
        id: key.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase().slice(0, 80),
        name: title,
        category: hostal.name,
        // El asistente filtra los productos por marca: la marca es el hostal.
        brand: hostal.name,
        price: rates.length ? rates[0][1] : rooms[0].baseRate,
        prices_by_guests: rates.length ? Object.fromEntries(rates.map(([n, v]) => [String(n), v])) : undefined,
        option: label,
        currency: "CLP",
        description:
          `${hostal.name}: ${rooms.length} ${rooms.length === 1 ? "habitación" : "habitaciones"}: ${label}. Admite de ${cap === 1 ? "1 persona" : `1 a ${cap} personas`}. ` +
          `Valor: ${priceText}${hostal.breakfast ? " con desayuno incluido" : " (sin desayuno)"}. ` +
          `Check-in desde las 14:00 y check-out a las 12:00. ` +
          `Habitaciones libres por noche, de ${nightLabel(input.today)} a ${nightLabel(lastNight)} de ${rooms.length} en total (la fecha es la noche que se duerme; el día de salida no cuenta): ${describeNights(nights)}. ` +
          `Para unas fechas de entrada y salida, revisa cada noche desde la entrada hasta la víspera de la salida: quedan libres tantas habitaciones como el mínimo de esas noches. ` +
          `Calendario actualizado el ${input.updatedAt}; la reserva final la confirma recepción.`,
        total_rooms: rooms.length,
        capacity: cap,
        free_runs: runs.map((r) => ({ from: r.from, to_checkout: r.to, free: r.free })),
        ...(hostal.link ? { link: hostal.link } : {}),
      };
    });
}
