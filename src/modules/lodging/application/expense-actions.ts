"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { EXPENSE_UNIT_CODES, expenseFormSchema, parseExpenseAmount } from "../domain/expenses";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

function go(m: string | null, key: "success" | "error", message: string): never {
  const q = new URLSearchParams();
  if (m) q.set("month", m);
  q.set(key, message);
  redirect(`/lodging/expenses?${q.toString()}`);
}

function friendly(message: string) {
  if (/autoriz/i.test(message)) return "No tienes autorización para esta acción.";
  return message;
}

/** Valida que el hostal sea uno de los que tienen gastos y que el usuario lo tenga asignado. */
function allowedUnit(ctx: Awaited<ReturnType<typeof requirePermission>>, unitId: string) {
  return ctx.units.find((u) => u.id === unitId && EXPENSE_UNIT_CODES.includes(u.code));
}

export async function recordExpenseAction(form: FormData) {
  const ctx = await requirePermission("lodging.expenses.record");
  const parsed = expenseFormSchema.safeParse({
    unit_id: form.get("unit_id"),
    month: form.get("month"),
    expense_date: form.get("expense_date"),
    category_id: form.get("category_id"),
    description: form.get("description"),
    supplier: form.get("supplier") ?? "",
    document_number: form.get("document_number") ?? "",
    payment_method: form.get("payment_method"),
  });
  const back = month.safeParse(form.get("month")).data ?? null;
  if (!parsed.success) go(back, "error", parsed.error.issues[0]?.message ?? "Revisa los datos del gasto.");
  if (!allowedUnit(ctx, parsed.data.unit_id)) go(back, "error", "Hostal no válido.");
  const amount = parseExpenseAmount(String(form.get("amount") ?? ""));
  if (amount === null) go(back, "error", "Indica el monto en pesos, solo números (por ejemplo 45000).");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_record_expense", {
    target_unit: parsed.data.unit_id,
    payload: {
      expense_date: parsed.data.expense_date,
      category_id: parsed.data.category_id,
      description: parsed.data.description,
      supplier: parsed.data.supplier,
      document_number: parsed.data.document_number,
      amount,
      payment_method: parsed.data.payment_method,
    },
  });
  if (error) go(parsed.data.month, "error", friendly(error.message));
  revalidatePath("/lodging/expenses");
  go(parsed.data.expense_date.slice(0, 7), "success", "Gasto ingresado.");
}

export async function voidExpenseAction(form: FormData) {
  await requirePermission("lodging.expenses.record");
  const id = z.string().uuid().safeParse(form.get("expense_id"));
  const back = month.safeParse(form.get("month")).data ?? null;
  if (!id.success) go(back, "error", "Gasto no válido.");
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3) go(back, "error", "Indica el motivo de la anulación.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_void_expense", { target_expense: id.data, reason });
  if (error) go(back, "error", friendly(error.message));
  revalidatePath("/lodging/expenses");
  go(back, "success", "Gasto anulado.");
}

export async function addExpenseCategoryAction(form: FormData) {
  const ctx = await requirePermission("lodging.expenses.manage");
  const back = month.safeParse(form.get("month")).data ?? null;
  const unitId = z.string().uuid().safeParse(form.get("unit_id"));
  if (!unitId.success || !allowedUnit(ctx, unitId.data)) go(back, "error", "Hostal no válido.");
  const name = String(form.get("name") ?? "").trim();
  const section = String(form.get("section") ?? "");
  if (name.length < 2 || name.length > 80) go(back, "error", "El nombre del tipo debe tener entre 2 y 80 caracteres.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_add_expense_category", { target_unit: unitId.data, category_name: name, category_section: section });
  if (error) go(back, "error", friendly(error.message));
  revalidatePath("/lodging/expenses");
  go(back, "success", `Tipo de gasto «${name}» disponible.`);
}

export async function removeExpenseCategoryAction(form: FormData) {
  await requirePermission("lodging.expenses.manage");
  const back = month.safeParse(form.get("month")).data ?? null;
  const id = z.string().uuid().safeParse(form.get("category_id"));
  if (!id.success) go(back, "error", "Tipo de gasto no válido.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_remove_expense_category", { target_category: id.data });
  if (error) go(back, "error", friendly(error.message));
  revalidatePath("/lodging/expenses");
  go(back, "success", "Tipo de gasto quitado de la lista.");
}
