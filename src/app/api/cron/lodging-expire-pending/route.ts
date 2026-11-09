import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function valid(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const value =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Cancela solicitudes web que llevan más de 24 horas sin revisión. Al pasar
// a 'cancelled', el exclusion constraint de lodging_reservations libera la
// fecha automáticamente para nuevas solicitudes. Las que ya tienen un pago
// confirmado no se anulan solas: sus pagos dejarían de contar sin que nadie
// decidiera qué hacer con ellos; las resuelve recepción.
export async function GET(request: Request) {
  if (!valid(request))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: stale, error: staleError } = await db
    .from("lodging_reservations")
    .select("id,lodging_reservation_payments(status)")
    .eq("origin", "public_web")
    .eq("status", "pending")
    .lt("created_at", cutoff);
  if (staleError) return Response.json({ error: staleError.message }, { status: 500 });
  const ids = (stale ?? [])
    .filter((r) => !(r.lodging_reservation_payments ?? []).some((p) => p.status === "confirmed"))
    .map((r) => r.id);
  if (!ids.length) return Response.json({ ok: true, expired: 0 });
  const { data, error } = await db
    .from("lodging_reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending")
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, expired: data?.length ?? 0 });
}
