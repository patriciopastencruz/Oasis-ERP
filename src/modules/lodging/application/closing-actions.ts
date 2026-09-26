"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lodgingContext } from "./queries";
import { loadClosing } from "./closing-queries";
import { buildDailyClosingPdf } from "./closing-pdf";
import { renderClosingEmail, sendClosingEmail } from "./closing-email";
import { formatClosingDate, isValidDay } from "../domain/daily-closing";

const uuid = z.string().uuid();

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function friendly(error: { message?: string } | null) {
  const message = error?.message ?? "";
  console.error("[lodging-closing]", message);
  if (/hoy o el dia anterior/i.test(message))
    return "Solo puedes cerrar el día de hoy o el día anterior. Pide a administración cerrar fechas más antiguas.";
  if (/ya fue emitido/i.test(message))
    return "Este cierre ya fue emitido. Solo administración puede corregirlo.";
  if (/fecha futura/i.test(message)) return "No se puede cerrar una fecha futura.";
  if (/gasto|monto|descripcion/i.test(message))
    return "Revisa los gastos: cada uno necesita categoría, descripción y un monto mayor a cero.";
  if (/autoriz|permission|row-level|42501|no autorizada/i.test(message))
    return "No tienes autorización para esta acción.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}

const expenseSchema = z
  .array(
    z.object({
      description: z.string().trim().min(2).max(200),
      amount: z.number().int().positive(),
      payment_method: z.enum(["cash", "transfer", "card", "other"]),
      category_id: uuid,
    }),
  )
  .max(50);

export async function saveClosingAction(form: FormData) {
  const { unit, supabase } = await lodgingContext("lodging.closings.create");
  const date = String(form.get("closing_date") ?? "");
  const back = `/lodging/closing?date=${date}`;
  if (!isValidDay(date)) go("/lodging/closing", "error", "Fecha inválida.");
  let rawExpenses: unknown;
  try {
    rawExpenses = JSON.parse(String(form.get("expenses") ?? "[]"));
  } catch {
    go(back, "error", "No fue posible leer los gastos.");
  }
  const expenses = expenseSchema.safeParse(rawExpenses);
  if (!expenses.success)
    go(back, "error", "Revisa los gastos: cada uno necesita categoría, descripción y un monto mayor a cero.");
  const text = (key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
  const { data, error } = await supabase.rpc("lodging_save_daily_closing", {
    target_unit: unit.id,
    target_date: date,
    payload: {
      reported_problems: text("reported_problems", 2000),
      items_to_replenish: text("items_to_replenish", 2000),
      observations: text("observations", 4000),
      expenses: expenses.data,
    },
  });
  if (error) go(back, "error", friendly(error));
  revalidatePath("/lodging/closing");
  redirect(`/lodging/closing/${data}`);
}

async function emailClosing(id: string) {
  const { unit, supabase } = await lodgingContext("lodging.closings.create");
  const loaded = await loadClosing(supabase, id);
  if (!loaded) return { sent: false, message: "Cierre no encontrado." };
  const { data: recipients, error } = await supabase.rpc("lodging_closing_email_recipients", {
    target_closing: id,
  });
  if (error) return { sent: false, message: friendly(error) };
  const emails = ((recipients ?? []) as { email: string }[]).map((r) => r.email);
  const pdf = await buildDailyClosingPdf({ unit, ...loaded });
  const date = formatClosingDate(loaded.closing.closing_date);
  const result = await sendClosingEmail({
    to: emails,
    subject: `[OASIS ERP] Cierre diario ${unit.name} ${date}`,
    html: renderClosingEmail(unit.name, loaded.closing),
    pdf,
    filename: `cierre-${unit.code.toLowerCase()}-${loaded.closing.closing_date}.pdf`,
  });
  if (result.sent) {
    await supabase.rpc("lodging_mark_closing_emailed", { target_closing: id, recipients: emails });
    return { sent: true, message: `Cierre emitido y enviado por correo a ${emails.length} destinatario(s).` };
  }
  if (!result.configured)
    return { sent: false, message: "Cierre emitido. El correo no está configurado en el servidor." };
  if (!emails.length)
    return { sent: false, message: "Cierre emitido. No hay administradores con correo para notificar." };
  return { sent: false, message: "Cierre emitido, pero el correo falló. Usa «Reenviar correo»." };
}

export async function issueClosingAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.closings.create");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) go("/lodging/closing", "error", "Cierre inválido.");
  const path = `/lodging/closing/${id.data}`;
  const { error } = await supabase.rpc("lodging_issue_daily_closing", { target_closing: id.data });
  if (error) go(path, "error", friendly(error));
  const result = await emailClosing(id.data);
  revalidatePath("/lodging/closing");
  go(path, result.sent ? "success" : "error", result.message);
}

export async function resendClosingEmailAction(form: FormData) {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) go("/lodging/closing", "error", "Cierre inválido.");
  const result = await emailClosing(id.data);
  go(
    `/lodging/closing/${id.data}`,
    result.sent ? "success" : "error",
    result.sent ? result.message.replace("Cierre emitido y enviado", "Correo reenviado") : result.message,
  );
}

export async function deleteClosingAction(form: FormData) {
  const { supabase } = await lodgingContext("lodging.closings.manage");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) go("/lodging/closing", "error", "Cierre inválido.");
  const reason = String(form.get("reason") ?? "").trim();
  const path = `/lodging/closing/${id.data}`;
  if (reason.length < 3) go(path, "error", "Indica el motivo de la eliminación.");
  const { data, error } = await supabase.rpc("lodging_delete_daily_closing", {
    target_closing: id.data,
    reason,
  });
  if (error) go(path, "error", friendly(error));
  revalidatePath("/lodging/closing");
  go(
    `/lodging/closing?date=${data}`,
    "success",
    `Cierre del ${formatClosingDate(String(data))} eliminado. La fecha quedó libre para un nuevo cierre.`,
  );
}
