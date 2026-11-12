"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { DOCUMENT_PHOTO_ERROR, readDocumentPhotos } from "../domain/guest-documents";
import { saveReservationDocuments } from "./guest-documents";

function back(id: string, key: "success" | "error", message: string): never {
  redirect(`/lodging/reservations/${id}?${key}=${encodeURIComponent(message)}#datos-huesped`);
}

function guestError(message: string) {
  console.error("[reservation-guest]", message);
  if (/nombre/i.test(message)) return "Indica el nombre del huésped (al menos 3 letras).";
  if (/telefono/i.test(message)) return "Indica el teléfono del huésped (al menos 6 dígitos).";
  if (/correo/i.test(message)) return "Revisa el correo del huésped.";
  if (/anulada/i.test(message)) return "La reserva está anulada: no se pueden cambiar sus datos.";
  return "No fue posible guardar los datos del huésped.";
}

const text = (max: number) => z.string().trim().max(max).default("");

/** Guarda desde la ficha los datos de la persona (si el formulario los trae) y la foto del frente de su documento. */
export async function saveReservationGuestAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const id = z.string().uuid().parse(form.get("reservation_id"));
  const photos = await readDocumentPhotos(form);
  if (photos === "invalid") back(id, "error", DOCUMENT_PHOTO_ERROR);
  const { front } = photos as Exclude<typeof photos, "invalid">;
  const withGuest = form.get("with_guest") === "1";
  if (!withGuest && !front) back(id, "error", "Elige la foto del documento.");
  const supabase = await createSupabaseServerClient();
  if (withGuest) {
    const guest = z
      .object({ full_name: text(160), phone: text(50), email: text(160), document: text(80), nationality: text(80) })
      .parse(Object.fromEntries(form));
    const { error } = await supabase.rpc("lodging_update_reservation_guest", { p_reservation: id, p_payload: guest });
    if (error) back(id, "error", guestError(error.message));
  }
  const failure = await saveReservationDocuments(supabase, id, { front });
  if (failure) back(id, "error", `Los datos se guardaron, pero ${failure.charAt(0).toLowerCase()}${failure.slice(1)}`);
  revalidatePath(`/lodging/reservations/${id}`);
  back(id, "success", front ? "Datos y documento guardados." : "Datos del huésped guardados.");
}
