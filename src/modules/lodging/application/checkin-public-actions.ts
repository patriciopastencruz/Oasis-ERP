"use server";

// Punto de entrada NO autenticado del check-in online. Igual que la encuesta:
// usa el service role porque anon no tiene acceso a ninguna tabla; la
// validación de negocio vive en lodging_checkin_submit(). Las fotos del
// documento se suben aquí a un bucket privado, en la carpeta de la reserva.

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CHECKIN_TOKEN, DOCUMENT_PHOTO_EXT, MAX_DOCUMENT_PHOTO_BYTES, parseCheckinForm } from "../domain/checkin";
import { detectedMime } from "../domain/receipts";

const BUCKET = "lodging-guest-documents";

type Photo = { bytes: Uint8Array; mime: string };

async function readPhoto(value: FormDataEntryValue | null): Promise<Photo | null | "invalid"> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_DOCUMENT_PHOTO_BYTES) return "invalid";
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mime = detectedMime(bytes);
  return mime && DOCUMENT_PHOTO_EXT[mime] ? { bytes, mime } : "invalid";
}

export async function submitCheckinAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!CHECKIN_TOKEN.test(token)) redirect("/checkin/invalido");
  const back = `/checkin/${token}`;
  const fail = (message: string): never => redirect(`${back}?error=${encodeURIComponent(message)}`);
  const parsed = parseCheckinForm(form);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const front = await readPhoto(form.get("document_front"));
  if (front === "invalid") fail("La foto del documento debe ser JPG, PNG o WEBP de hasta 10 MB.");

  const db = createSupabaseAdminClient();
  const uploaded: string[] = [];
  const paths: { document_front_path?: string } = {};
  if (front) {
    const { data: prefix } = await db.rpc("lodging_checkin_upload_prefix", { p_token: token });
    if (!prefix) fail("Este link ya no está disponible. Pide uno nuevo a recepción.");
    const photo = front as Photo;
    const path = `${prefix}${randomUUID()}.${DOCUMENT_PHOTO_EXT[photo.mime]}`;
    const { error } = await db.storage.from(BUCKET).upload(path, photo.bytes, { contentType: photo.mime, upsert: false });
    if (error) {
      console.error("[checkin] No fue posible subir la foto", error.message);
      fail("No pudimos subir la foto. Intenta nuevamente.");
    }
    uploaded.push(path);
    paths.document_front_path = path;
  }

  const { data, error } = await db.rpc("lodging_checkin_submit", { p_token: token, p_payload: { ...parsed.data!, ...paths } });
  if (error) {
    if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded);
    console.error("[checkin] No fue posible guardar el check-in", { code: error.code, message: error.message });
    fail(
      /no disponible/i.test(error.message)
        ? "Este link ya no está disponible. Pide uno nuevo a recepción."
        : /foto de tu documento/i.test(error.message)
          ? "Sube la foto de tu carnet o pasaporte (frente)."
          : "No pudimos guardar tus datos. Revisa la información e intenta nuevamente.",
    );
  }
  // Fotos reemplazadas: no se guardan copias viejas del documento.
  const replaced = ((data as { replaced?: string[] } | null)?.replaced ?? []).filter(Boolean);
  if (replaced.length) await db.storage.from(BUCKET).remove(replaced);
  redirect(`${back}?listo=1`);
}
