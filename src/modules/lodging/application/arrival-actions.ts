"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { arrivalMessage } from "../domain/arrival-message";
import { checkinUrl, whatsappNumber } from "../domain/checkin";
import { santiagoToday } from "../domain/daily-closing";
import { surveyBaseUrl } from "./survey-links";

export type ArrivalContactResult = { ok: true; message: string; phone: string | null; waUrl: string | null } | { ok: false; error: string };

const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? (value[0] ?? null) : value);

/**
 * Prepara el mensaje de bienvenida de una llegada: reutiliza el link de check-in online vigente (o crea
 * uno si no hay), arma el texto con la información del hostal y deja anotado el contacto.
 */
export async function prepareArrivalContactAction(reservationId: string): Promise<ArrivalContactResult> {
  const ctx = await requirePermission("lodging.reservations.manage");
  const id = z.string().uuid().safeParse(reservationId);
  if (!id.success) return { ok: false, error: "Reserva no válida." };
  const supabase = await createSupabaseServerClient();
  const { data: r, error } = await supabase
    .from("lodging_reservations")
    .select("id,status,origin,check_in,business_unit_id,room_id,lodging_rooms(name),lodging_guests(full_name,phone)")
    .eq("id", id.data)
    .maybeSingle();
  if (error || !r) return { ok: false, error: "No encontré la reserva." };
  if (["cancelled", "conflict", "checked_out"].includes(r.status) || r.origin === "maintenance")
    return { ok: false, error: "Esta reserva ya no admite contacto de llegada." };
  const unit = ctx.units.find((u) => u.id === r.business_unit_id);
  if (!unit) return { ok: false, error: "Hostal no autorizado." };

  const { data: link } = await supabase
    .from("lodging_checkin_links")
    .select("token")
    .eq("reservation_id", r.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  let token = link?.token ?? null;
  if (!token) {
    const created = await supabase.rpc("lodging_checkin_link_create", { target_reservation: r.id });
    if (created.error) console.error("[arrival-contact] link", created.error.message);
    else token = created.data as string;
  }
  const { data: info } = await supabase.from("lodging_arrival_info").select("info").eq("business_unit_id", r.business_unit_id).maybeSingle();
  const guest = one(r.lodging_guests);
  const room = one(r.lodging_rooms);
  const { data: codeRow } = await supabase.from("lodging_room_access_codes").select("code").eq("room_id", r.room_id).maybeSingle();
  const message = arrivalMessage({
    unitCode: unit.code,
    unitName: unit.name,
    guestName: guest?.full_name,
    checkinUrl: token ? checkinUrl(surveyBaseUrl(await headers()), token) : null,
    info: info?.info,
    checkIn: r.check_in,
    today: santiagoToday(),
    roomName: room?.name,
    roomCode: codeRow?.code,
  });
  const marked = await supabase.rpc("lodging_arrival_contact_mark", { target_reservation: r.id });
  if (marked.error) console.error("[arrival-contact] marca", marked.error.message);
  revalidatePath("/lodging/arrivals");
  revalidatePath(`/lodging/reservations/${r.id}`);
  const phone = whatsappNumber(guest?.phone);
  return { ok: true, message, phone, waUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null };
}

/** Guarda el texto de "Información de llegada" del hostal (dirección, ubicación, WiFi, etc.). */
export async function saveArrivalInfoAction(form: FormData) {
  const ctx = await requirePermission("lodging.operations.configure");
  const unitId = z.string().uuid().safeParse(form.get("unit_id"));
  const info = String(form.get("info") ?? "").trim();
  const go = (key: "success" | "error", message: string): never => redirect(`/lodging/arrivals?${key}=${encodeURIComponent(message)}`);
  if (!unitId.success || !ctx.units.some((u) => u.id === unitId.data)) go("error", "Hostal no válido.");
  if (info.length > 2500) go("error", "El texto no puede pasar de 2.500 caracteres.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lodging_arrival_info_save", { target_unit: unitId.success ? unitId.data : "", new_info: info });
  if (error) go("error", /autoriz/i.test(error.message) ? "No tienes autorización para esta acción." : "No fue posible guardar el texto.");
  revalidatePath("/lodging/arrivals");
  go("success", "Información de llegada guardada.");
}

/** Guarda las claves de ingreso autónomo de las habitaciones de un hostal (vacío = sin clave). */
export async function saveRoomCodesAction(form: FormData) {
  const ctx = await requirePermission("lodging.operations.configure");
  const unitId = z.string().uuid().safeParse(form.get("unit_id"));
  const go = (key: "success" | "error", message: string): never => redirect(`/lodging/arrivals?${key}=${encodeURIComponent(message)}`);
  if (!unitId.success || !ctx.units.some((u) => u.id === unitId.data)) go("error", "Hostal no válido.");
  const supabase = await createSupabaseServerClient();
  const { data: rooms } = await supabase.from("lodging_rooms").select("id").eq("business_unit_id", unitId.success ? unitId.data : "").eq("active", true);
  for (const room of rooms ?? []) {
    const code = String(form.get(`code_${room.id}`) ?? "").trim();
    if (code.length > 40) go("error", "Cada clave puede tener hasta 40 caracteres.");
    const { error } = await supabase.rpc("lodging_room_access_code_save", { target_room: room.id, new_code: code });
    if (error) go("error", /autoriz/i.test(error.message) ? "No tienes autorización para esta acción." : "No fue posible guardar las claves.");
  }
  revalidatePath("/lodging/arrivals");
  go("success", "Claves de las habitaciones guardadas.");
}
