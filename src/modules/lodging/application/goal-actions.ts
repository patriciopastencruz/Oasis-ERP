"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { REVIEW_CATEGORIES, parseScoreInput } from "../domain/review-scores";

const BACK = "/lodging/settings";

function go(key: "success" | "error", message: string): never {
  redirect(`${BACK}?${key}=${encodeURIComponent(message)}`);
}

/** Metas del reporte semanal de un hostal. Campos vacíos = sin meta. */
export async function saveReportGoalsAction(form: FormData) {
  const ctx = await requirePermission("lodging.goals.manage");
  const unit = z.string().uuid().safeParse(form.get("unit_id"));
  if (!unit.success || !ctx.units.some((u) => u.id === unit.data)) go("error", "Hostal no autorizado.");
  const field = (name: string) => parseScoreInput(String(form.get(name) ?? ""));
  const occupancy = field("occupancy_pct");
  const rate = field("average_rate");
  const score = field("booking_score");
  if (occupancy !== null && (occupancy < 0 || occupancy > 100)) go("error", "La meta de ocupación debe estar entre 0 y 100%.");
  if (rate !== null && rate < 0) go("error", "La meta de venta promedio no puede ser negativa.");
  if (score !== null && (score < 0 || score > 10)) go("error", "El puntaje meta debe estar entre 0 y 10.");
  const categories: Record<string, number> = {};
  for (const { key } of REVIEW_CATEGORIES) {
    const v = field(`cat_${key}`);
    if (v === null) continue;
    if (v < 0 || v > 10) go("error", "Las metas por área deben estar entre 0 y 10.");
    categories[key] = v;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_set_report_goals", {
    target_unit: unit.data,
    goals: { occupancy_pct: occupancy, average_rate: rate, booking_score: score, booking_categories: categories },
  });
  if (error) {
    console.error("[lodging-goals]", error.message);
    go("error", "No fue posible guardar las metas.");
  }
  revalidatePath(BACK);
  go("success", "Metas guardadas.");
}
