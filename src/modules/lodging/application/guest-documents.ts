import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentPhoto } from "../domain/guest-documents";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const BUCKET = "lodging-guest-documents";

/**
 * Sube las fotos del documento a la carpeta de la reserva (empresa/hostal/reserva/archivo) y las registra con
 * lodging_set_reservation_documents, que vuelve a validar permiso, hostal y ruta. Devuelve un mensaje si falló.
 */
export async function saveReservationDocuments(
  supabase: Supabase,
  reservationId: string,
  photos: { front: DocumentPhoto | null; back: DocumentPhoto | null },
): Promise<string | null> {
  if (!photos.front && !photos.back) return null;
  const { data: reservation } = await supabase
    .from("lodging_reservations")
    .select("company_id,business_unit_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) return "Reserva no encontrada.";
  const admin = createSupabaseAdminClient();
  const uploaded: string[] = [];
  const upload = async (photo: DocumentPhoto | null) => {
    if (!photo) return null;
    const path = `${reservation.company_id}/${reservation.business_unit_id}/${reservationId}/${randomUUID()}.${photo.ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, photo.bytes, { contentType: photo.mime, upsert: false });
    if (error) throw new Error(error.message);
    uploaded.push(path);
    return path;
  };
  try {
    const front = await upload(photos.front);
    const back = await upload(photos.back);
    const { data, error } = await supabase.rpc("lodging_set_reservation_documents", {
      p_reservation: reservationId,
      p_front: front,
      p_back: back,
    });
    if (error) throw new Error(error.message);
    // Fotos reemplazadas: no se guardan copias viejas del documento.
    const replaced = ((data as { replaced?: string[] } | null)?.replaced ?? []).filter(Boolean);
    if (replaced.length) await admin.storage.from(BUCKET).remove(replaced);
    return null;
  } catch (error) {
    console.error("[reservation-documents]", error instanceof Error ? error.message : error);
    if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded);
    return "No fue posible guardar el documento.";
  }
}
