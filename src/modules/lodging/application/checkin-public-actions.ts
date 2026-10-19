"use server";

// Punto de entrada NO autenticado del check-in online. Igual que la encuesta:
// usa el service role porque anon no tiene acceso a ninguna tabla; la
// validación de negocio vive en lodging_checkin_submit().

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CHECKIN_TOKEN, parseCheckinForm } from "../domain/checkin";

export async function submitCheckinAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!CHECKIN_TOKEN.test(token)) redirect("/checkin/invalido");
  const back = `/checkin/${token}`;
  const parsed = parseCheckinForm(form);
  if (!parsed.success)
    redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Revisa los datos.")}`);
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("lodging_checkin_submit", { p_token: token, p_payload: parsed.data });
  if (error) {
    console.error("[checkin] No fue posible guardar el check-in", { code: error.code, message: error.message });
    const message = /no disponible/i.test(error.message)
      ? "Este link ya no está disponible. Pide uno nuevo a recepción."
      : "No pudimos guardar tus datos. Revisa la información e intenta nuevamente.";
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${back}?listo=1`);
}
