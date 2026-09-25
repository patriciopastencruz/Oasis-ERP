"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cashFlowContext } from "./queries";
import { paymentMethods, resolveDay } from "../domain/cash-flow";

const uuid = z.string().uuid();
const dailyPath = "/finance/cash-flow";
const categoriesPath = "/finance/cash-flow/categories";

function done(
  path: string,
  params: Record<string, string>,
  type: "success" | "error",
  message: string,
): never {
  const query = new URLSearchParams({ ...params, [type]: message });
  redirect(`${path}?${query.toString()}`);
}

function errorMessage(error: { message?: string } | null) {
  const value = error?.message ?? "";
  console.error("[cash-flow]", value);
  if (/autoriz|permission|row-level|42501/i.test(value))
    return "No tienes autorización para esta acción.";
  if (/dia ya esta cerrado/i.test(value))
    return "El día ya está cerrado. Debe reabrirse para modificarlo.";
  if (/fecha(s)? futura/i.test(value))
    return "No se pueden registrar movimientos en fechas futuras.";
  if (/categoria invalida/i.test(value))
    return "La categoría seleccionada no es válida para esta unidad.";
  if (/categoria ya existe/i.test(value)) return "La categoría ya existe.";
  if (/monto/i.test(value)) return "El monto debe ser mayor a cero.";
  if (/descripcion/i.test(value)) return "La descripción es obligatoria.";
  if (/motivo/i.test(value)) return "Debes indicar un motivo.";
  if (/no encontrad/i.test(value)) return "El registro no existe o no pertenece a tu unidad.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}

/** Convierte "12.500" o "12500" en número entero CLP. */
function amount(value: FormDataEntryValue | null) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

const entrySchema = z.object({
  category_id: uuid,
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(2).max(300),
  amount: z.number().int().positive(),
  payment_method: z.enum(Object.keys(paymentMethods) as [keyof typeof paymentMethods]),
  reference: z.string().trim().max(120),
});

export async function recordEntryAction(form: FormData) {
  const { unit, supabase } = await cashFlowContext("finance.cash_flow.record");
  const day = resolveDay(String(form.get("entry_date") ?? ""));
  const parsed = entrySchema.safeParse({
    category_id: form.get("category_id"),
    entry_date: day,
    description: String(form.get("description") ?? ""),
    amount: amount(form.get("amount")),
    payment_method: form.get("payment_method"),
    reference: String(form.get("reference") ?? ""),
  });
  if (!parsed.success)
    done(dailyPath, { date: day }, "error", "Revisa categoría, descripción y monto.");
  const { error } = await supabase.rpc("cash_flow_record_entry", {
    payload: { ...parsed.data, business_unit_id: unit.id },
  });
  if (error) done(dailyPath, { date: day }, "error", errorMessage(error));
  revalidatePath(dailyPath);
  done(
    dailyPath,
    { date: day },
    "success",
    form.get("kind") === "expense" ? "Gasto registrado." : "Ingreso registrado.",
  );
}

export async function voidEntryAction(form: FormData) {
  const { supabase } = await cashFlowContext("finance.cash_flow.record");
  const day = resolveDay(String(form.get("date") ?? ""));
  const id = uuid.safeParse(form.get("id"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!id.success || reason.length < 3)
    done(dailyPath, { date: day }, "error", "Indica el motivo de la anulación.");
  const { error } = await supabase.rpc("cash_flow_void_entry", {
    target_entry: id.data,
    reason,
  });
  if (error) done(dailyPath, { date: day }, "error", errorMessage(error));
  revalidatePath(dailyPath);
  done(dailyPath, { date: day }, "success", "Movimiento anulado.");
}

export async function closeDayAction(form: FormData) {
  const { unit, supabase } = await cashFlowContext("finance.cash_flow.record");
  const day = resolveDay(String(form.get("date") ?? ""));
  const { error } = await supabase.rpc("cash_flow_close_day", {
    target_unit: unit.id,
    target_date: day,
    payload: {
      opening_cash: amount(form.get("opening_cash")) ?? 0,
      counted_cash: amount(form.get("counted_cash")),
      notes: String(form.get("notes") ?? "").trim(),
    },
  });
  if (error) done(dailyPath, { date: day }, "error", errorMessage(error));
  revalidatePath(dailyPath);
  revalidatePath(`${dailyPath}/monthly`);
  done(dailyPath, { date: day }, "success", "Día cerrado correctamente.");
}

export async function reopenDayAction(form: FormData) {
  const { unit, supabase } = await cashFlowContext("finance.cash_flow.manage");
  const day = resolveDay(String(form.get("date") ?? ""));
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3)
    done(dailyPath, { date: day }, "error", "Indica el motivo de la reapertura.");
  const { error } = await supabase.rpc("cash_flow_reopen_day", {
    target_unit: unit.id,
    target_date: day,
    reason,
  });
  if (error) done(dailyPath, { date: day }, "error", errorMessage(error));
  revalidatePath(dailyPath);
  revalidatePath(`${dailyPath}/monthly`);
  done(dailyPath, { date: day }, "success", "Día reabierto. Puedes corregir y volver a cerrarlo.");
}

export async function createCategoryAction(form: FormData) {
  const { unit, supabase } = await cashFlowContext("finance.cash_flow.manage");
  const kind = z.enum(["income", "expense"]).safeParse(form.get("kind"));
  const name = String(form.get("name") ?? "").trim();
  if (!kind.success || name.length < 2)
    done(categoriesPath, {}, "error", "Indica tipo y nombre de la categoría.");
  const { error } = await supabase.rpc("cash_flow_create_category", {
    target_unit: unit.id,
    target_kind: kind.data,
    category_name: name,
  });
  if (error) done(categoriesPath, {}, "error", errorMessage(error));
  revalidatePath(categoriesPath);
  done(categoriesPath, {}, "success", "Categoría creada.");
}

export async function toggleCategoryAction(form: FormData) {
  const { supabase } = await cashFlowContext("finance.cash_flow.manage");
  const id = uuid.safeParse(form.get("id"));
  const active = form.get("active") === "true";
  if (!id.success) done(categoriesPath, {}, "error", "Categoría inválida.");
  const { error } = await supabase.rpc("cash_flow_toggle_category", {
    target_category: id.data,
    is_active: active,
  });
  if (error) done(categoriesPath, {}, "error", errorMessage(error));
  revalidatePath(categoriesPath);
  done(categoriesPath, {}, "success", active ? "Categoría activada." : "Categoría desactivada.");
}
