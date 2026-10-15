"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadReceptionBonus } from "./bonus-queries";
import { BONUS_INDICATORS } from "../domain/reception-bonus";
import { parseScoreInput } from "../domain/review-scores";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

function go(m: string, key: "success" | "error", message: string): never {
  redirect(`/kpis/bonos?month=${m}&${key}=${encodeURIComponent(message)}`);
}

export async function saveBonusConfigAction(form: FormData) {
  const ctx = await requirePermission("kpis.bonus.manage");
  const m = month.safeParse(form.get("month"));
  const unitId = z.string().uuid().safeParse(form.get("unit_id"));
  const back = m.success ? m.data : new Date().toISOString().slice(0, 7);
  if (!unitId.success || !ctx.units.some((u) => u.id === unitId.data && lodgingUnitCodes.includes(u.code)))
    go(back, "error", "Hostal no válido.");
  const pool = parseScoreInput(String(form.get("pool_amount") ?? "").replace(/\./g, ""));
  if (pool === null || pool < 0) go(back, "error", "Indica el monto del bono (número, sin puntos).");
  const weights: Record<string, number> = {};
  for (const { key } of BONUS_INDICATORS) {
    const n = Number(form.get(`w_${key}`));
    if (!Number.isInteger(n) || n < 0 || n > 100) go(back, "error", "Cada peso debe ser un número entero entre 0 y 100.");
    weights[key] = n;
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total !== 100) go(back, "error", `Los pesos deben sumar 100 (ahora suman ${total}).`);
  const surveyGoal = parseScoreInput(String(form.get("survey_goal") ?? ""));
  const minResponses = Number(form.get("survey_min_responses"));
  const maxWait = Number(form.get("inspection_max_wait_minutes"));
  if (surveyGoal === null || surveyGoal < 1 || surveyGoal > 5) go(back, "error", "La meta de la encuesta va de 1 a 5.");
  if (!Number.isInteger(minResponses) || minResponses < 0) go(back, "error", "El mínimo de respuestas debe ser un número entero.");
  if (!Number.isInteger(maxWait) || maxWait < 1 || maxWait > 1440) go(back, "error", "El tiempo máximo de inspección va de 1 a 1.440 minutos.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_save_bonus_config", {
    target_unit: unitId.data,
    payload: {
      pool_amount: pool,
      weights,
      survey_goal: surveyGoal,
      survey_min_responses: minResponses,
      inspection_max_wait_minutes: maxWait,
    },
  });
  if (error) go(back, "error", /autoriz/i.test(error.message) ? "No tienes autorización para esta acción." : error.message);
  revalidatePath("/kpis/bonos");
  go(back, "success", "Configuración del bono guardada.");
}

/** Guarda el resultado de un mes terminado. Se recalcula en el servidor; no se confía en lo que envía el navegador. */
export async function saveBonusResultAction(form: FormData) {
  const ctx = await requirePermission("kpis.bonus.manage");
  const m = month.safeParse(form.get("month"));
  if (!m.success) go(new Date().toISOString().slice(0, 7), "error", "Mes no válido.");
  const unitId = z.string().uuid().safeParse(form.get("unit_id"));
  const unit = ctx.units.find((u) => u.id === (unitId.success ? unitId.data : "") && lodgingUnitCodes.includes(u.code));
  if (!unit) go(m.data, "error", "Hostal no válido.");

  const supabase = await createSupabaseServerClient();
  const [bonus] = await loadReceptionBonus(supabase, [{ id: unit.id, code: unit.code, name: unit.name }], m.data);
  if (bonus.provisional) go(m.data, "error", "Solo se guarda el resultado de un mes ya terminado.");
  const { error } = await supabase.rpc("lodging_save_bonus_result", {
    target_unit: unit.id,
    target_month: bonus.monthStart,
    payload: {
      pool_amount: bonus.config.pool,
      points: Math.round(bonus.result.points * 100) / 100,
      amount: bonus.result.amount,
      gate_applied: bonus.result.gateApplied,
      detail: { rows: bonus.result.rows, input: bonus.input, counts: bonus.counts },
    },
  });
  if (error) go(m.data, "error", /autoriz/i.test(error.message) ? "No tienes autorización para esta acción." : error.message);
  revalidatePath("/kpis/bonos");
  go(m.data, "success", `Resultado de ${unit.name} guardado.`);
}
