"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lodgingContext } from "./queries";

const uuid = z.string().uuid();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const basePath = "/lodging/monthly";

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function friendly(error: { message?: string } | null) {
  const message = error?.message ?? "";
  console.error("[lodging-monthly]", message);
  if (/ya esta cerrado/i.test(message)) return "El mes ya está cerrado. Reábrelo para modificarlo.";
  if (/mes futuro/i.test(message)) return "No se puede preparar un mes futuro.";
  if (/categoria/i.test(message)) return "Revisa la categoría seleccionada.";
  if (/descripcion|monto/i.test(message)) return "Revisa la descripción y el monto.";
  if (/motivo/i.test(message)) return "Indica el motivo.";
  if (/autoriz|permission|row-level|42501|no autorizada/i.test(message)) return "No tienes autorización para esta acción.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}

function monthOf(form: FormData) {
  const month = String(form.get("month") ?? "");
  if (!monthPattern.test(month)) go(basePath, "error", "Mes inválido.");
  return month;
}
const amountOf = (value: FormDataEntryValue | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

export async function startMonthAction(form: FormData) {
  const { unit, supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const month = monthOf(form);
  const { error } = await supabase.rpc("lodging_monthly_start", { target_unit: unit.id, target_period: `${month}-01` });
  const path = `${basePath}?month=${month}`;
  if (error) go(path, "error", friendly(error));
  revalidatePath(basePath);
  go(path, "success", "Cierre del mes iniciado. Se copiaron los costos fijos del mes anterior como pendientes.");
}

export async function saveLineAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const month = monthOf(form);
  const path = `${basePath}?month=${month}`;
  const closing = uuid.safeParse(form.get("closing_id"));
  const lineId = String(form.get("line_id") ?? "");
  const amount = amountOf(form.get("amount"));
  const description = String(form.get("description") ?? "").trim();
  const category = uuid.safeParse(form.get("category_id"));
  if (!closing.success || !category.success || amount === null || description.length < 2)
    go(`${path}${lineId ? `&edit=${lineId}` : ""}`, "error", "Completa categoría, descripción y monto.");
  const { error } = await supabase.rpc("lodging_monthly_save_line", {
    target_closing: closing.data,
    payload: {
      id: uuid.safeParse(lineId).success ? lineId : null,
      category_id: category.data,
      description: description.slice(0, 160),
      amount,
      payer: String(form.get("payer") ?? "").trim().slice(0, 60),
      payment_status: form.get("payment_status") === "pendiente" ? "pendiente" : "pagado",
    },
  });
  if (error) go(path, "error", friendly(error));
  revalidatePath(basePath);
  go(path, "success", lineId ? "Línea actualizada." : "Línea agregada.");
}

export async function deleteLineAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const month = monthOf(form);
  const line = uuid.safeParse(form.get("line_id"));
  if (!line.success) go(`${basePath}?month=${month}`, "error", "Línea inválida.");
  const { error } = await supabase.rpc("lodging_monthly_delete_line", { target_line: line.data });
  if (error) go(`${basePath}?month=${month}`, "error", friendly(error));
  revalidatePath(basePath);
  go(`${basePath}?month=${month}`, "success", "Línea eliminada.");
}

export async function toggleLineStatusAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const month = monthOf(form);
  const line = uuid.safeParse(form.get("line_id"));
  if (!line.success) go(`${basePath}?month=${month}`, "error", "Línea inválida.");
  const { error } = await supabase.rpc("lodging_monthly_toggle_line_status", { target_line: line.data });
  if (error) go(`${basePath}?month=${month}`, "error", friendly(error));
  revalidatePath(basePath);
  redirect(`${basePath}?month=${month}`);
}

export async function closeMonthAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const month = monthOf(form);
  const closing = uuid.safeParse(form.get("closing_id"));
  if (!closing.success) go(`${basePath}?month=${month}`, "error", "Cierre inválido.");
  const { error } = await supabase.rpc("lodging_monthly_close", {
    target_closing: closing.data,
    closing_notes: String(form.get("notes") ?? "").trim().slice(0, 2000),
  });
  if (error) go(`${basePath}?month=${month}`, "error", friendly(error));
  revalidatePath(basePath);
  go(`${basePath}?month=${month}`, "success", "Mes cerrado. Los totales quedaron fijos en el informe.");
}

export async function reopenMonthAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const month = monthOf(form);
  const closing = uuid.safeParse(form.get("closing_id"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!closing.success || reason.length < 3) go(`${basePath}?month=${month}`, "error", "Indica el motivo de la reapertura.");
  const { error } = await supabase.rpc("lodging_monthly_reopen", { target_closing: closing.data, reason });
  if (error) go(`${basePath}?month=${month}`, "error", friendly(error));
  revalidatePath(basePath);
  go(`${basePath}?month=${month}`, "success", "Mes reabierto. Puedes corregir y volver a cerrarlo.");
}

const categoriesPath = `${basePath}/categories`;

export async function createFinanceCategoryAction(form: FormData) {
  const { unit, supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const section = z.enum(["income", "fixed", "variable", "investment", "withdrawal", "other"]).safeParse(form.get("section"));
  const name = String(form.get("name") ?? "").trim();
  if (!section.success || name.length < 2) go(categoriesPath, "error", "Indica sección y nombre.");
  const { error } = await supabase.rpc("lodging_finance_category_create", {
    target_unit: unit.id,
    target_section: section.data,
    category_name: name,
    daily: form.get("allow_daily") === "on",
  });
  if (error) go(categoriesPath, "error", /ya existe/i.test(error.message) ? "La categoría ya existe." : friendly(error));
  revalidatePath(categoriesPath);
  go(categoriesPath, "success", "Categoría creada.");
}

export async function toggleFinanceCategoryAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) go(categoriesPath, "error", "Categoría inválida.");
  const active = form.get("active") === "true";
  const { error } = await supabase.rpc("lodging_finance_category_toggle", { target_category: id.data, is_active: active });
  if (error) go(categoriesPath, "error", friendly(error));
  revalidatePath(categoriesPath);
  go(categoriesPath, "success", active ? "Categoría activada." : "Categoría desactivada.");
}
