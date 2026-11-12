import { DOCUMENT_PHOTO_EXT, MAX_DOCUMENT_PHOTO_BYTES } from "./checkin";
import { detectedMime } from "./receipts";

export const DOCUMENT_PHOTO_ERROR = "La foto del documento debe ser JPG, PNG o WEBP de hasta 10 MB.";

export type DocumentPhoto = { bytes: Uint8Array; mime: string; ext: string };

/** Foto de un campo de archivo: null si no se eligió, "invalid" si no es JPG/PNG/WEBP (se mira el contenido) o pesa de más. */
export async function readDocumentPhoto(value: FormDataEntryValue | null): Promise<DocumentPhoto | null | "invalid"> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_DOCUMENT_PHOTO_BYTES) return "invalid";
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mime = detectedMime(bytes);
  return mime && DOCUMENT_PHOTO_EXT[mime] ? { bytes, mime, ext: DOCUMENT_PHOTO_EXT[mime] } : "invalid";
}

/** Foto del frente del documento tal como llega del formulario de la reserva (el reverso no se pide). */
export async function readDocumentPhotos(form: FormData) {
  const front = await readDocumentPhoto(form.get("document_front"));
  return front === "invalid" ? ("invalid" as const) : { front };
}
