"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { DOCUMENT_PHOTO_ERROR, readDocumentPhotos } from "../domain/guest-documents";
import { saveReservationDocuments } from "./guest-documents";

function back(id: string, key: "success" | "error", message: string): never {
  redirect(`/lodging/reservations/${id}?${key}=${encodeURIComponent(message)}#documento-identidad`);
}

/** Adjunta o reemplaza las fotos del documento de identidad de una reserva ya creada. */
export async function attachReservationDocumentsAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const id = z.string().uuid().parse(form.get("reservation_id"));
  const photos = await readDocumentPhotos(form);
  if (photos === "invalid") back(id, "error", DOCUMENT_PHOTO_ERROR);
  const { front, back: reverse } = photos as Exclude<typeof photos, "invalid">;
  if (!front && !reverse) back(id, "error", "Elige al menos una foto del documento.");
  const supabase = await createSupabaseServerClient();
  const failure = await saveReservationDocuments(supabase, id, { front, back: reverse });
  if (failure) back(id, "error", failure);
  revalidatePath(`/lodging/reservations/${id}`);
  back(id, "success", "Documento de identidad guardado.");
}
