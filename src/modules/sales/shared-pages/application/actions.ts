"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { isValidSlug, slugify, validateHtmlFile } from "../domain/shared-pages";

const PATH = "/sales/shared-pages";
const uuid = z.string().uuid();

function done(type: "success" | "error", message: string): never {
  redirect(`${PATH}?${type}=${encodeURIComponent(message)}`);
}

function errorMessage(error: { code?: string; message?: string } | null) {
  const value = error?.message ?? "";
  if (error?.code === "23505") return "Ese enlace ya existe. Elige otro nombre de enlace.";
  if (error?.code === "23514") return "Revisa el título, el enlace y el tamaño del archivo.";
  if (/autoriz|permission|row-level/i.test(value)) return "No tienes autorización para esta acción.";
  if (/no parece una p/i.test(value)) return "El archivo no parece una página HTML.";
  return "No fue posible completar la operación.";
}

async function readHtml(file: FormDataEntryValue | null) {
  if (!(file instanceof File)) return { error: "Adjunta el archivo .html." as const };
  const invalid = validateHtmlFile(file);
  if (invalid) return { error: invalid };
  return { html: await file.text() };
}

export async function createSharedPageAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.create");
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Escribe un título.").max(120),
      slug: z.string().trim().max(60),
      source_url: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) done("error", parsed.error.issues[0].message);
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.title);
  if (!isValidSlug(slug)) done("error", "El enlace debe tener entre 3 y 60 letras o números.");
  if (parsed.data.source_url && !/^https:\/\//i.test(parsed.data.source_url))
    done("error", "El link de origen debe comenzar con https://");
  const read = await readHtml(form.get("file"));
  if ("error" in read) done("error", read.error!);
  const { error } = await supabase.rpc("om_create_shared_page", {
    p_title: parsed.data.title,
    p_slug: slug,
    p_source_url: parsed.data.source_url || null,
    p_html: read.html,
  });
  if (error) done("error", errorMessage(error));
  revalidatePath(PATH);
  done("success", `Página publicada en /p/${slug}.`);
}

export async function replaceSharedPageFileAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.create");
  const id = uuid.safeParse(form.get("page_id"));
  if (!id.success) done("error", "Página no válida.");
  const read = await readHtml(form.get("file"));
  if ("error" in read) done("error", read.error!);
  const { error } = await supabase.rpc("om_replace_shared_page_html", { p_page: id.data, p_html: read.html });
  if (error) done("error", errorMessage(error));
  revalidatePath(PATH);
  done("success", "Archivo actualizado. El enlace sigue siendo el mismo.");
}

export async function toggleSharedPageAction(form: FormData) {
  const { supabase, unit } = await salesContext("sales.quotations.create");
  const id = uuid.safeParse(form.get("page_id"));
  if (!id.success) done("error", "Página no válida.");
  const active = form.get("active") === "true";
  const { error } = await supabase
    .from("om_shared_pages")
    .update({ active })
    .eq("id", id.data)
    .eq("business_unit_id", unit.id)
    .is("deleted_at", null);
  if (error) done("error", errorMessage(error));
  revalidatePath(PATH);
  done("success", active ? "Página activada." : "Página desactivada: el enlace ya no la muestra.");
}

/** No se borra el registro: se marca como eliminada y el enlace queda reservado para no reutilizarlo. */
export async function deleteSharedPageAction(form: FormData) {
  const { supabase, unit } = await salesContext("sales.quotations.create");
  const id = uuid.safeParse(form.get("page_id"));
  if (!id.success) done("error", "Página no válida.");
  const { error } = await supabase
    .from("om_shared_pages")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("business_unit_id", unit.id)
    .is("deleted_at", null);
  if (error) done("error", errorMessage(error));
  revalidatePath(PATH);
  done("success", "Página eliminada.");
}
