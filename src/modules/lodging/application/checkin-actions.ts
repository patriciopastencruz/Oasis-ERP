"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

function back(id: string, key: "success" | "error", message: string): never {
  redirect(`/lodging/reservations/${id}?${key}=${encodeURIComponent(message)}#checkin-online`);
}

/** Crea el link de check-in online (reemplaza el anterior si había uno). */
export async function createCheckinLinkAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const id = z.string().uuid().parse(form.get("reservation_id"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_checkin_link_create", { target_reservation: id });
  if (error) {
    console.error("[checkin-link]", error.message);
    back(id, "error", /no admite/i.test(error.message) ? "Esta reserva no admite check-in online." : "No fue posible crear el link.");
  }
  revalidatePath(`/lodging/reservations/${id}`);
  back(id, "success", "Link de check-in listo para enviar al huésped.");
}

export async function revokeCheckinLinkAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const id = z.string().uuid().parse(form.get("reservation_id"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_checkin_link_revoke", { target_reservation: id });
  if (error) back(id, "error", "No fue posible desactivar el link.");
  revalidatePath(`/lodging/reservations/${id}`);
  back(id, "success", "Link de check-in desactivado.");
}
