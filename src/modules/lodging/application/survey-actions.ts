"use server";

// Punto de entrada NO autenticado de la encuesta de satisfacción. Igual que
// public-actions.ts: usa el service role porque anon no tiene acceso a
// ninguna tabla; la validación de negocio vive en submit_lodging_survey().

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { surveySubmissionSchema } from "../domain/survey";

export async function submitSurveyAction(form: FormData) {
  const raw = Object.fromEntries(form);
  const token = String(raw.token ?? "");
  const back = `/encuesta/${/^[a-f0-9]{32}$/.test(token) ? token : "invalido"}`;
  const parsed = surveySubmissionSchema.safeParse(raw);
  if (!parsed.success)
    redirect(
      `${back}?error=${encodeURIComponent("Responde todas las preguntas con puntaje para enviar tu opinión.")}`,
    );
  // Bots: se simula éxito sin guardar nada.
  if (parsed.data.website) redirect(`${back}?gracias=1`);

  const { token: validToken, website: _website, ...payload } = parsed.data;
  void _website;
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("submit_lodging_survey", {
    p_token: validToken,
    p_payload: payload,
  });
  if (error) {
    console.error("[survey] No fue posible guardar la encuesta", {
      code: error.code,
      message: error.message,
    });
    const message = /Demasiadas/.test(error.message)
      ? "Recibimos muchas respuestas seguidas. Intenta nuevamente en un rato."
      : "No pudimos guardar tu opinión. Intenta nuevamente.";
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${back}?gracias=1`);
}
