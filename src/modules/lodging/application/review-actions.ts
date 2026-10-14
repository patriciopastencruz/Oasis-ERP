"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { REVIEW_CATEGORIES, parseScoreInput } from "../domain/review-scores";

const BACK = "/lodging/reviews";

function go(key: "success" | "error", message: string): never {
  redirect(`${BACK}?${key}=${encodeURIComponent(message)}`);
}

export async function saveReviewScoreAction(form: FormData) {
  const ctx = await requirePermission("lodging.reviews.view");
  const unit = z.string().uuid().safeParse(form.get("unit_id"));
  if (!unit.success || !ctx.units.some((u) => u.id === unit.data))
    go("error", "Elige un hostal válido.");
  const score = parseScoreInput(String(form.get("score") ?? ""));
  const count = parseScoreInput(String(form.get("review_count") ?? ""));
  if (score === null || score < 0 || score > 10)
    go("error", "El puntaje debe estar entre 0 y 10.");
  if (count === null || !Number.isInteger(count) || count < 0)
    go("error", "Indica la cantidad de comentarios (número entero).");

  const categories: Record<string, number> = {};
  for (const { key } of REVIEW_CATEGORIES) {
    const value = parseScoreInput(String(form.get(`cat_${key}`) ?? ""));
    if (value === null) continue;
    if (value < 0 || value > 10) go("error", "Las categorías deben estar entre 0 y 10.");
    categories[key] = value;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_record_review_score", {
    target_unit: unit.data,
    payload: {
      source: "booking",
      recorded_on: String(form.get("recorded_on") ?? "") || undefined,
      score,
      review_count: count,
      categories,
    },
  });
  if (error) {
    console.error("[review-score] No fue posible guardar", { code: error.code });
    go(
      "error",
      /autoriz/i.test(error.message)
        ? "No tienes autorización para esta acción."
        : error.message,
    );
  }
  revalidatePath(BACK);
  go("success", "Puntaje registrado.");
}
