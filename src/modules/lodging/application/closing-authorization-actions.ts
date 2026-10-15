"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dispatchApprovalEmails } from "@/lib/notifications/approval-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { lodgingContext } from "./queries";
import { formatClosingDate, isValidDay } from "../domain/daily-closing";

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function friendly(message: string) {
  console.error("[lodging-closing-authorization]", message);
  if (/motivo del rechazo/i.test(message)) return "Indica el motivo del rechazo.";
  if (/motivo/i.test(message)) return "Indica el motivo (al menos 5 caracteres).";
  if (/hoy y ayer/i.test(message)) return "Hoy y ayer se cierran sin autorización.";
  if (/90 dias/i.test(message)) return "Solo se pueden autorizar cierres de los últimos 90 días.";
  if (/ya esta autorizada/i.test(message)) return "Esa fecha ya está autorizada.";
  if (/pendiente/i.test(message)) return "Ya hay una solicitud pendiente para esa fecha.";
  if (/ya fue resuelta/i.test(message)) return "La solicitud ya fue resuelta.";
  if (/autoriz|no autorizada|42501/i.test(message)) return "No tienes autorización para esta acción.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}

/** Recepción pide autorización para cerrar una fecha anterior a ayer. */
export async function requestClosingAuthorizationAction(form: FormData) {
  const { unit } = await lodgingContext("lodging.closings.create");
  const date = String(form.get("closing_date") ?? "");
  if (!isValidDay(date)) go("/lodging/closing", "error", "Fecha inválida.");
  const back = `/lodging/closing?date=${date}`;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lodging_closing_authorization_request", {
    target_unit: unit.id,
    target_date: date,
    request_reason: reason,
  });
  if (error) go(back, "error", friendly(error.message));
  revalidatePath("/lodging/closing");
  if ((data as { approved?: boolean } | null)?.approved) go(back, "success", "Fecha autorizada. Ya puedes hacer el cierre.");
  await dispatchApprovalEmails().catch(() => {});
  go(back, "success", `Solicitud enviada. Te avisaremos cuando administración autorice el cierre del ${formatClosingDate(date)}.`);
}

/** Administración o gerencia aprueba o rechaza la solicitud. */
export async function decideClosingAuthorizationAction(form: FormData) {
  await requirePermission("lodging.closings.authorize");
  const back = "/lodging/closing/authorizations";
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) go(back, "error", "Solicitud inválida.");
  const approve = form.get("decision") === "approve";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_closing_authorization_decide", {
    target_request: id.data,
    approve,
    notes: String(form.get("notes") ?? "").trim().slice(0, 500),
  });
  if (error) go(back, "error", friendly(error.message));
  revalidatePath(back);
  go(back, "success", approve ? "Cierre autorizado por 48 horas." : "Solicitud rechazada.");
}
