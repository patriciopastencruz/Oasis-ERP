import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addDays, santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { FEED_HOSTALS, buildAvailabilityFeed, type FeedRoom } from "@/modules/lodging/domain/availability-feed";

// Noches hacia adelante que cubre el calendario.
const DAYS = 90;

const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/**
 * Calendario de disponibilidad de los 3 hostales, de solo lectura, para el asistente de reservas.
 * Exige una clave (se guarda solo su hash) y no entrega datos de huéspedes: únicamente tipos de
 * habitación, tarifas y cuántas habitaciones hay libres cada noche.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (key.length < 20 || key.length > 200) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: noStore });
  const db = createSupabaseAdminClient();
  const hash = createHash("sha256").update(key).digest("hex");
  const { data: keyRow } = await db.from("lodging_public_feed_keys").select("id").eq("key_hash", hash).eq("active", true).maybeSingle();
  if (!keyRow) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: noStore });
  void db.from("lodging_public_feed_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  const today = santiagoToday();
  const { data: units, error: unitsError } = await db
    .from("business_units")
    .select("id,code")
    .in("code", Object.keys(FEED_HOSTALS))
    .is("deleted_at", null);
  if (unitsError || !units?.length) return NextResponse.json({ error: "Sin datos" }, { status: 500, headers: noStore });
  const codeOf = new Map(units.map((u) => [u.id, u.code]));
  const unitIds = units.map((u) => u.id);

  const [roomsRes, bookingsRes] = await Promise.all([
    db
      .from("lodging_rooms")
      .select("id,name,room_type,capacity,base_rate,business_unit_id")
      .in("business_unit_id", unitIds)
      .eq("active", true)
      .not("status", "in", '("maintenance","out_of_service")'),
    // Todo estado salvo cancelada o en conflicto retiene la fecha; los bloqueos por mantención también.
    db
      .from("lodging_reservations")
      .select("room_id,check_in,check_out")
      .in("business_unit_id", unitIds)
      .not("status", "in", '("cancelled","conflict")')
      .gt("check_out", today)
      .lt("check_in", addDays(today, DAYS))
      .limit(10000),
  ]);
  if (roomsRes.error || bookingsRes.error) {
    console.error("[availability-feed] fallo al leer el calendario", { rooms: roomsRes.error?.code, bookings: bookingsRes.error?.code });
    return NextResponse.json({ error: "Sin datos" }, { status: 500, headers: noStore });
  }
  const rooms: FeedRoom[] = (roomsRes.data ?? []).map((r) => ({
    id: r.id,
    unitCode: codeOf.get(r.business_unit_id) ?? "",
    name: r.name,
    roomType: r.room_type ?? "Habitación",
    capacity: Number(r.capacity ?? 1),
    baseRate: Number(r.base_rate ?? 0),
  }));
  const updatedAt = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const feed = buildAvailabilityFeed({ rooms, bookings: bookingsRes.data ?? [], today, days: DAYS, updatedAt });
  return NextResponse.json(feed, { headers: noStore });
}
