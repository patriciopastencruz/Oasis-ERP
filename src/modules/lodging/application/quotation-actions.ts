"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lodgingContext } from "./queries";
import { detectedMime } from "../domain/receipts";
import { MAX_PHOTO_BYTES } from "../domain/incidents";
import { QUOTATION_MAX_PHOTOS, quotationFormSchema } from "../domain/quotations";

const NEW_PATH = "/lodging/quotations/new";

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function friendly(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (/autoriz/i.test(message)) return "No tienes autorización para esta acción.";
  if (/ya esta anulada/i.test(message)) return "La cotización ya está anulada.";
  if (/motivo/i.test(message)) return "Indica el motivo de la anulación (mínimo 5 caracteres).";
  if (/invalido|requiere|empresa|posterior|maximo/i.test(message)) return message;
  return "No fue posible completar la operación.";
}

type Supabase = Awaited<ReturnType<typeof lodgingContext>>["supabase"];

/** Sube las fotos con la sesión del usuario; el tipo se detecta por contenido. Devuelve cuántas quedaron. */
async function uploadQuotationPhotos(
  supabase: Supabase,
  companyId: string,
  unitId: string,
  quotationId: string,
  files: File[],
) {
  let saved = 0;
  for (const file of files.slice(0, QUOTATION_MAX_PHOTOS)) {
    if (file.size < 1 || file.size > MAX_PHOTO_BYTES) continue;
    const mime = detectedMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") continue;
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
    const path = `${companyId}/${unitId}/${quotationId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from("lodging-operations")
      .upload(path, file, { contentType: mime, upsert: false });
    if (up.error) {
      console.error("[lodging quotation] photo upload", up.error.message);
      continue;
    }
    const { error } = await supabase.rpc("lodging_quotation_attach", {
      target_quotation: quotationId,
      object_path: path,
      mime,
      size_bytes: file.size,
      original_name: file.name.slice(0, 200) || "foto",
    });
    if (error) {
      await supabase.storage.from("lodging-operations").remove([path]);
      if (/maximo 4 fotos/i.test(error.message)) break;
      continue;
    }
    saved++;
  }
  return saved;
}

export async function createLodgingQuotationAction(form: FormData) {
  const { unit, supabase } = await lodgingContext("lodging.quotations.manage");
  let rawLines: unknown = [];
  try {
    rawLines = JSON.parse(String(form.get("lines") ?? "[]"));
  } catch {
    go(NEW_PATH, "error", "La cotización requiere ítems.");
  }
  const parsed = quotationFormSchema.safeParse({
    client_company: form.get("client_company") ?? "",
    client_rut: form.get("client_rut") ?? "",
    client_contact: form.get("client_contact") ?? "",
    client_email: form.get("client_email") ?? "",
    hostel_address: form.get("hostel_address") ?? "",
    service_detail: form.get("service_detail") ?? "",
    check_in: form.get("check_in") ?? "",
    check_out: form.get("check_out") ?? "",
    lines: rawLines,
  });
  if (!parsed.success)
    go(NEW_PATH, "error", parsed.error.issues[0]?.message ?? "Revisa los datos de la cotización.");
  // Los totales NO viajan: la base de datos los calcula a partir de las líneas.
  const { data, error } = await supabase.rpc("lodging_create_quotation", {
    target_unit: unit.id,
    payload: parsed.data,
  });
  if (error) go(NEW_PATH, "error", friendly(error));
  const quotationId = data as string;

  // Las fotos son un efecto secundario: si fallan, la cotización ya quedó emitida.
  const photos = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const saved = photos.length
    ? await uploadQuotationPhotos(supabase, unit.company_id, unit.id, quotationId, photos)
    : 0;
  revalidatePath("/lodging/quotations");
  const note =
    photos.length && saved < photos.length
      ? ` ${photos.length - saved} foto(s) no se pudieron adjuntar.`
      : "";
  go(`/lodging/quotations/${quotationId}`, "success", `Cotización emitida.${note}`);
}

export async function voidLodgingQuotationAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.quotations.manage");
  const parsed = z
    .object({ quotation_id: z.string().uuid(), reason: z.string().trim() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) go("/lodging/quotations", "error", "Cotización inválida.");
  const { quotation_id, reason } = parsed.data;
  const back = `/lodging/quotations/${quotation_id}`;
  const { error } = await supabase.rpc("lodging_void_quotation", {
    target_quotation: quotation_id,
    reason,
  });
  if (error) go(back, "error", friendly(error));
  revalidatePath("/lodging/quotations");
  revalidatePath(back);
  go(back, "success", "Cotización anulada.");
}
