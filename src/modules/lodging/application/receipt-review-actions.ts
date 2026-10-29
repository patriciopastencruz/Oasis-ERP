"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { receiptReviewFormSchema, safeReviewBackPath } from "../domain/receipt-manual-review";

function go(path: string, key: "success" | "error", message: string): never {
  const base = path.replace(/([?&])(success|error)=[^&]*/g, "$1").replace(/[?&]$/, "");
  redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

/** Deja constancia de que una persona revisó los comprobantes de una reserva (quién, cuándo, resultado y comentario). */
export async function reviewReceiptsAction(form: FormData) {
  await requirePermission("lodging.receipts.review");
  const back = safeReviewBackPath(form.get("back"), "/lodging/reports/history");
  const parsed = receiptReviewFormSchema.safeParse({
    reservation_id: form.get("reservation_id"),
    outcome: form.get("outcome"),
    comment: form.get("comment"),
  });
  if (!parsed.success) go(back, "error", parsed.error.issues[0]?.message ?? "Revisión inválida.");
  const s = await createSupabaseServerClient();
  const { error } = await s.rpc("lodging_review_receipts", {
    target_reservation: parsed.data.reservation_id,
    p_outcome: parsed.data.outcome,
    p_comment: parsed.data.comment,
  });
  if (error)
    go(back, "error", /autoriz/i.test(error.message) ? "No tienes autorización para esta acción." : "No fue posible registrar la revisión.");
  revalidatePath("/lodging/reports/history");
  revalidatePath(`/lodging/reservations/${parsed.data.reservation_id}`);
  go(back, "success", "Revisión registrada.");
}
