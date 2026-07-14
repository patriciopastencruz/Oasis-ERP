import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateIcal } from "@/modules/lodging/domain/reservations";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ parts: string[] }> },
) {
  const { parts } = await params;
  const match =
    parts.length === 1 ? parts[0].match(/^([a-f0-9]{64})\.ics$/) : null;
  if (!match) return new Response("No encontrado", { status: 404 });
  const token = match[1];
  const db = createSupabaseAdminClient();
  const { data: room } = await db
    .from("lodging_rooms")
    .select("id,code")
    .eq("export_token", token)
    .eq("export_enabled", true)
    .eq("active", true)
    .maybeSingle();
  if (!room) return new Response("No encontrado", { status: 404 });
  const { data } = await db
    .from("lodging_reservations")
    .select("id,check_in,check_out")
    .eq("room_id", room.id)
    .not("status", "in", '("cancelled","conflict")')
    .gte(
      "check_out",
      new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    )
    .order("check_in");
  return new Response(generateIcal(room.code, data ?? []), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${room.code}.ics"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
