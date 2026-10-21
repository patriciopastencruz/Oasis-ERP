import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { searchAvailability, type AvailabilityResult } from "@/modules/lucia/domain/availability";

export type AvailabilityQuery = { check_in: string; check_out: string; guests: number };

/**
 * Disponibilidad real de las hostales habilitadas en Lucía, leída del ERP con
 * la clave de servicio. Solo lectura: no bloquea ni crea reservas. Igual que
 * el calendario público, toda reserva salvo cancelada o en conflicto ocupa la
 * fecha, y no se ofrecen habitaciones en mantención o fuera de servicio.
 */
export async function checkLuciaAvailability(
  admin: SupabaseClient,
  companyId: string,
  query: AvailabilityQuery,
): Promise<AvailabilityResult> {
  const { data: hostelRows, error: hostelsError } = await admin
    .from("lucia_hostels")
    .select("business_unit_id,display_name,business_units(code)")
    .eq("company_id", companyId)
    .eq("enabled", true);
  if (hostelsError) return { ok: false, error: "No se pudo leer la disponibilidad." };
  const hostels = (hostelRows ?? []).map((h) => {
    const unit = Array.isArray(h.business_units) ? h.business_units[0] : h.business_units;
    return { unitId: h.business_unit_id as string, code: (unit as { code?: string } | null)?.code ?? "", name: h.display_name as string };
  });
  const order = ["HU", "HOC", "HOB"];
  hostels.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const unitIds = hostels.map((h) => h.unitId);
  if (!unitIds.length) return { ok: false, error: "No hay hostales habilitadas." };

  const [roomsRes, bookingsRes] = await Promise.all([
    admin
      .from("lodging_rooms")
      .select("id,business_unit_id,room_type,description,capacity,base_rate,rates_by_guests")
      .in("business_unit_id", unitIds)
      .eq("active", true)
      .not("status", "in", '("maintenance","out_of_service")'),
    admin
      .from("lodging_reservations")
      .select("room_id,check_in,check_out")
      .in("business_unit_id", unitIds)
      .not("status", "in", '("cancelled","conflict")')
      .lt("check_in", query.check_out)
      .gt("check_out", query.check_in)
      .limit(10000),
  ]);
  if (roomsRes.error || bookingsRes.error) return { ok: false, error: "No se pudo leer la disponibilidad." };
  const codeOf = new Map(hostels.map((h) => [h.unitId, h.code]));

  return searchAvailability({
    hostels: hostels.map(({ code, name }) => ({ code, name })),
    rooms: (roomsRes.data ?? []).map((r) => ({
      id: r.id,
      hostelCode: codeOf.get(r.business_unit_id) ?? "",
      roomType: r.room_type ?? "Habitación",
      description: r.description,
      capacity: Number(r.capacity ?? 1),
      baseRate: Number(r.base_rate ?? 0),
      ratesByGuests: (r.rates_by_guests as Record<string, number> | null) ?? null,
    })),
    bookings: bookingsRes.data ?? [],
    checkIn: query.check_in,
    checkOut: query.check_out,
    guests: Number(query.guests),
    today: santiagoToday(),
  });
}
