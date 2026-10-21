import { freeRoomsPerNight, normalizeDescription, type FeedBooking } from "@/modules/lodging/domain/availability-feed";
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

export type AvailabilityResult =
  | { ok: false; error: string }
  | {
      ok: true;
      llegada: string;
      salida: string;
      noches: number;
      personas: number;
      hostales: { hostal: string; codigo: string; opciones: AvailabilityOption[] }[];
      sin_disponibilidad: string[];
    };

export const MAX_NIGHTS = 30;

function nightsBetween(checkIn: string, checkOut: string) {
  return Math.round((Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86_400_000);
}

function label(room: AvailabilityRoom) {
  const description = room.description ? normalizeDescription(room.description) : "";
  return description ? `${room.roomType}: ${description.charAt(0).toLowerCase()}${description.slice(1)}` : room.roomType;
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
    const groups = new Map<string, AvailabilityRoom[]>();
    for (const room of input.rooms) {
      if (room.hostelCode !== hostel.code || room.capacity < guests) continue;
      const key = [room.roomType, room.description ?? "", room.capacity, room.baseRate, JSON.stringify(room.ratesByGuests ?? {})].join("|");
      groups.set(key, [...(groups.get(key) ?? []), room]);
    }
    const opciones: AvailabilityOption[] = [];
    for (const rooms of groups.values()) {
      const free = Math.min(
        ...freeRoomsPerNight(rooms.map((r) => r.id), input.bookings, checkIn, nights).map((n) => n.free),
      );
      if (free < 1) continue;
      const price = rateForGuests({ base_rate: rooms[0].baseRate, rates_by_guests: rooms[0].ratesByGuests ?? undefined }, guests);
      opciones.push({
        codigo: rooms[0].id,
        habitacion: label(rooms[0]),
        capacidad: rooms[0].capacity,
        libres: free,
        precio_noche: price,
        total_estadia: price * nights,
      });
    }
    opciones.sort((a, b) => a.precio_noche - b.precio_noche || a.habitacion.localeCompare(b.habitacion));
    return { hostal: hostel.name, codigo: hostel.code, opciones };
  });

  return {
    ok: true,
    llegada: checkIn,
    salida: checkOut,
    noches: nights,
    personas: guests,
    hostales: hostales.filter((h) => h.opciones.length > 0),
    sin_disponibilidad: hostales.filter((h) => h.opciones.length === 0).map((h) => h.hostal),
  };
}
