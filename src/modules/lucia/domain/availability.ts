import { normalizeDescription, type FeedBooking } from "@/modules/lodging/domain/availability-feed";
import { rateForGuests } from "@/modules/lodging/domain/reservations";

export type AvailabilityRoom = {
  id: string;
  hostelCode: string;
  roomType: string;
  description: string | null;
  capacity: number;
  baseRate: number;
  ratesByGuests: Record<string, number> | null;
};

export type AvailabilityHostel = { code: string; name: string };

export type AvailabilityOption = {
  /** Identifica la opción (id de una habitación del grupo) para reservar exactamente esa. */
  codigo: string;
  habitacion: string;
  capacidad: number;
  libres: number;
  precio_noche: number;
  total_estadia: number;
};

export type AvailabilityCombination = {
  habitaciones: {
    codigo: string;
    habitacion: string;
    personas: number;
    precio_noche: number;
    total_estadia: number;
  }[];
  precio_noche: number;
  total_estadia: number;
};

export type AvailabilityResult =
  | { ok: false; error: string }
  | {
      ok: true;
      llegada: string;
      salida: string;
      noches: number;
      personas: number;
      hostales: {
        hostal: string;
        codigo: string;
        opciones: AvailabilityOption[];
        combinaciones: AvailabilityCombination[];
      }[];
      sin_disponibilidad: string[];
      /** Hostales con lugar, pero sin habitaciones con baño privado libres (si se pidió). */
      sin_bano_privado?: string[];
    };

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Se descartan solo las que dicen baño compartido sin mencionar uno privado:
// si la descripción no dice nada del baño, la opción se mantiene.
const hasPrivateBath = (label: string) => {
  const text = plain(label);
  return /bano privado|bano propio|con bano\b/.test(text) || !/bano compartido/.test(text);
};

export const MAX_NIGHTS = 30;

function nightsBetween(checkIn: string, checkOut: string) {
  return Math.round((Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86_400_000);
}

function label(room: AvailabilityRoom) {
  let description = room.description ? normalizeDescription(room.description) : "";
  // «Mini depto: mini deptos 1 cama…»: no repetir el tipo al inicio de la descripción.
  const type = plain(room.roomType).trim();
  if (type && /^s?(?:[\s,:-]|$)/.test(plain(description).slice(type.length)) && plain(description).startsWith(type)) {
    description = description.slice(type.length).replace(/^s?[\s,:-]*/, "");
  }
  return description ? `${room.roomType}: ${description.charAt(0).toLowerCase()}${description.slice(1)}` : room.roomType;
}

function isFreeForStay(roomId: string, bookings: FeedBooking[], checkIn: string, checkOut: string) {
  return !bookings.some(
    (booking) =>
      booking.room_id === roomId && booking.check_in < checkOut && booking.check_out > checkIn,
  );
}

function roomRate(room: AvailabilityRoom, guests: number) {
  return rateForGuests(
    { base_rate: room.baseRate, rates_by_guests: room.ratesByGuests ?? undefined },
    guests,
  );
}

function guestDistributions(rooms: AvailabilityRoom[], guests: number) {
  const results: number[][] = [];
  const visit = (index: number, remaining: number, assigned: number[]) => {
    if (index === rooms.length) {
      if (remaining === 0) results.push(assigned);
      return;
    }
    const roomsLeft = rooms.length - index - 1;
    const maxForThisRoom = Math.min(rooms[index].capacity, remaining - roomsLeft);
    for (let people = 1; people <= maxForThisRoom; people++) {
      visit(index + 1, remaining - people, [...assigned, people]);
    }
  };
  visit(0, guests, []);
  return results;
}

function roomSelections(rooms: AvailabilityRoom[], size: number) {
  const results: AvailabilityRoom[][] = [];
  const visit = (start: number, selected: AvailabilityRoom[]) => {
    if (selected.length === size) {
      results.push(selected);
      return;
    }
    for (let index = start; index <= rooms.length - (size - selected.length); index++) {
      visit(index + 1, [...selected, rooms[index]]);
    }
  };
  visit(0, []);
  return results;
}

/** Mejor combinación real de hasta cuatro habitaciones para alojar al grupo completo. */
function bestRoomCombination(
  rooms: AvailabilityRoom[],
  guests: number,
  nights: number,
): AvailabilityCombination | null {
  const maxRooms = Math.min(4, rooms.length, guests);
  for (let size = 2; size <= maxRooms; size++) {
    const candidates: (AvailabilityCombination & { unusedCapacity: number })[] = [];
    for (const selected of roomSelections(rooms, size)) {
      const capacity = selected.reduce((total, room) => total + room.capacity, 0);
      if (capacity < guests) continue;
      for (const distribution of guestDistributions(selected, guests)) {
        const habitaciones = selected.map((room, index) => {
          const people = distribution[index];
          const price = roomRate(room, people);
          return {
            codigo: room.id,
            habitacion: label(room),
            personas: people,
            precio_noche: price,
            total_estadia: price * nights,
          };
        });
        const price = habitaciones.reduce((total, room) => total + room.precio_noche, 0);
        candidates.push({
          habitaciones,
          precio_noche: price,
          total_estadia: price * nights,
          unusedCapacity: capacity - guests,
        });
      }
    }
    candidates.sort(
      (a, b) => a.unusedCapacity - b.unusedCapacity || a.precio_noche - b.precio_noche,
    );
    const best = candidates[0];
    if (best) {
      return {
        habitaciones: best.habitaciones,
        precio_noche: best.precio_noche,
        total_estadia: best.total_estadia,
      };
    }
  }
  return null;
}

/**
 * Opciones libres para TODAS las noches de la estadía, por hostal. Una
 * habitación sirve si admite a todas las personas; el precio sale de la
 * tarifa por cantidad de personas del ERP. Solo lectura: no reserva nada.
 */
export function searchAvailability(input: {
  hostels: AvailabilityHostel[];
  rooms: AvailabilityRoom[];
  bookings: FeedBooking[];
  checkIn: string;
  checkOut: string;
  guests: number;
  today: string;
  /** Solo opciones con baño privado, cuando el cliente lo pide. */
  privateBathOnly?: boolean;
}): AvailabilityResult {
  const { checkIn, checkOut, guests, today } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut))
    return { ok: false, error: "Fechas inválidas: usa AAAA-MM-DD." };
  if (checkIn < today) return { ok: false, error: "La fecha de llegada ya pasó." };
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return { ok: false, error: "La salida debe ser posterior a la llegada." };
  if (nights > MAX_NIGHTS) return { ok: false, error: `Estadías de más de ${MAX_NIGHTS} noches las cotiza el encargado.` };
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) return { ok: false, error: "Cantidad de personas inválida." };

  const hostales = input.hostels.map((hostel) => {
    const freeRooms = input.rooms
      .filter(
        (room) =>
          room.hostelCode === hostel.code &&
          isFreeForStay(room.id, input.bookings, checkIn, checkOut),
      )
      .sort((a, b) => label(a).localeCompare(label(b)) || a.id.localeCompare(b.id));
    const groups = new Map<string, AvailabilityRoom[]>();
    for (const room of freeRooms) {
      if (room.capacity < guests) continue;
      const key = [room.roomType, room.description ?? "", room.capacity, room.baseRate, JSON.stringify(room.ratesByGuests ?? {})].join("|");
      groups.set(key, [...(groups.get(key) ?? []), room]);
    }
    const opciones: AvailabilityOption[] = [];
    for (const rooms of groups.values()) {
      const free = rooms.length;
      const price = roomRate(rooms[0], guests);
      opciones.push({
        codigo: rooms[0].id,
        habitacion: label(rooms[0]),
        capacidad: rooms[0].capacity,
        libres: free,
        precio_noche: price,
        total_estadia: price * nights,
      });
    }
    // Para el cliente, misma descripción y mismo precio son una sola opción
    // (pueden venir de grupos con distinta tarifa para otra cantidad de personas).
    const merged = new Map<string, AvailabilityOption>();
    for (const o of opciones) {
      const key = `${o.habitacion}|${o.precio_noche}`;
      const prev = merged.get(key);
      if (prev) prev.libres += o.libres;
      else merged.set(key, { ...o });
    }
    opciones.length = 0;
    opciones.push(...merged.values());
    opciones.sort((a, b) => a.precio_noche - b.precio_noche || a.habitacion.localeCompare(b.habitacion));
    const elegibles = input.privateBathOnly ? opciones.filter((o) => hasPrivateBath(o.habitacion)) : opciones;
    const roomsForCombination = input.privateBathOnly
      ? freeRooms.filter((room) => hasPrivateBath(label(room)))
      : freeRooms;
    const combination = elegibles.length
      ? null
      : bestRoomCombination(roomsForCombination, guests, nights);
    const anyCombination = opciones.length
      ? null
      : bestRoomCombination(freeRooms, guests, nights);
    return {
      hostal: hostel.name,
      codigo: hostel.code,
      opciones: elegibles,
      combinaciones: combination ? [combination] : [],
      conLugar: opciones.length > 0 || Boolean(anyCombination),
    };
  });

  return {
    ok: true,
    llegada: checkIn,
    salida: checkOut,
    noches: nights,
    personas: guests,
    hostales: hostales
      .filter((h) => h.opciones.length > 0 || h.combinaciones.length > 0)
      .map(({ hostal, codigo, opciones, combinaciones }) => ({ hostal, codigo, opciones, combinaciones })),
    sin_disponibilidad: hostales.filter((h) => !h.conLugar).map((h) => h.hostal),
    ...(input.privateBathOnly
      ? {
          sin_bano_privado: hostales
            .filter((h) => h.conLugar && h.opciones.length === 0 && h.combinaciones.length === 0)
            .map((h) => h.hostal),
        }
      : {}),
  };
}

/** Ubicación que se muestra entre paréntesis junto al nombre de cada hostal. */
export const HOSTEL_LOCATIONS: Record<string, string> = {
  HU: "Uruguay, sector 23 de marzo",
  HOC: "Centro de Calama",
  HOB: "Cobija, parcela número 10, cercano a Pedro de Valdivia",
};

const hostelTitle = (name: string, code: string) => (HOSTEL_LOCATIONS[code] ? `${name} (${HOSTEL_LOCATIONS[code]})` : name);

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/**
 * Lista de opciones lista para WhatsApp: todas las opciones, una por línea,
 * agrupadas por hostal. La arma el sistema para que no se agrupen rangos ni
 * se omitan opciones.
 */
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «del miércoles 28 al jueves 29 de octubre»: las fechas consultadas, para que el cliente note si se entendió mal. */
export function stayRangeEs(checkIn: string, checkOut: string) {
  const a = new Date(`${checkIn}T12:00:00Z`);
  const b = new Date(`${checkOut}T12:00:00Z`);
  const day = (d: Date) => `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
  const firstMonth = a.getUTCMonth() === b.getUTCMonth() ? "" : ` de ${MONTHS[a.getUTCMonth()]}`;
  return `del ${day(a)}${firstMonth} al ${day(b)} de ${MONTHS[b.getUTCMonth()]}`;
}

export function formatAvailabilityForWhatsApp(result: AvailabilityResult): string {
  if (!result.ok) return "";
  const nights = `${result.noches} noche${result.noches === 1 ? "" : "s"}`;
  // Con una sola noche el total es igual al precio por noche: no se repite.
  const stayTotal = (total: number) => (result.noches === 1 ? "" : ` (${clp(total)} por ${nights})`);
  const blocks = result.hostales.map((h) =>
    [
      `*${hostelTitle(h.hostal, h.codigo)}* 🏨`,
      ...h.opciones.map((o) => `• ${o.habitacion}: ${clp(o.precio_noche)} por noche${stayTotal(o.total_estadia)}`),
      ...h.combinaciones.flatMap((combination) => [
        `Opción para el grupo en ${combination.habitaciones.length} habitaciones:`,
        ...combination.habitaciones.map(
          (room) =>
            `• ${room.habitacion} para ${room.personas} persona${room.personas === 1 ? "" : "s"}: ${clp(room.precio_noche)} por noche`,
        ),
        `Total: ${clp(combination.precio_noche)} por noche${stayTotal(combination.total_estadia)}`,
      ]),
    ].join("\n"),
  );
  if (result.sin_bano_privado?.length) {
    blocks.push(`${result.sin_bano_privado.join(" y ")} no ${result.sin_bano_privado.length === 1 ? "tiene" : "tienen"} habitaciones con baño privado libres para esas fechas.`);
  }
  if (result.sin_disponibilidad.length) {
    // Sin lugar puede ser por ocupación o porque ninguna pieza admite a tantas personas.
    const people = `${result.personas} persona${result.personas === 1 ? "" : "s"}`;
    const dates = stayRangeEs(result.llegada, result.salida);
    blocks.push(
      result.hostales.length === 0
        ? `😔 No tenemos habitaciones libres para ${people} ${dates} en ninguna de nuestras hostales.`
        : `${result.sin_disponibilidad.join(" y ")} no ${result.sin_disponibilidad.length === 1 ? "tiene" : "tienen"} habitaciones libres para ${people} ${dates}.`,
    );
  }
  return blocks.join("\n\n");
}
