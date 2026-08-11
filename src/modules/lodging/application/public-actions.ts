"use server";

// Único punto de entrada NO autenticado del módulo lodging. A diferencia de
// actions.ts, estas funciones nunca pasan por requirePermission() para la
// creación de la solicitud: usan el service role (createSupabaseAdminClient)
// exactamente como los otros endpoints públicos del proyecto
// (api/ical/rooms, api/cron/lodging-ical, api/whatsapp/webhook). Toda la
// validación de negocio vive aquí, en TypeScript, porque anon no tiene
// acceso directo a ninguna tabla de lodging (ver migración
// 20260714003139_hostal_uruguay_reservations.sql).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { dispatchApprovalEmails } from "@/lib/notifications/approval-email";
import { totalForStay } from "../domain/reservations";
import { detectedMime } from "../domain/receipts";

const PUBLIC_UNIT_CODE = "HU";

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

async function resolvePublicUnit() {
  const db = createSupabaseAdminClient();
  const { data: unit } = await db
    .from("business_units")
    .select("id,company_id,name")
    .eq("code", PUBLIC_UNIT_CODE)
    .is("deleted_at", null)
    .maybeSingle();
  return unit;
}

export async function publicLodgingRooms() {
  const unit = await resolvePublicUnit();
  if (!unit) return { unit: null, rooms: [] as never[] };
  const db = createSupabaseAdminClient();
  const { data: rooms } = await db
    .from("lodging_rooms")
    .select("id,code,name,capacity,base_rate")
    .eq("business_unit_id", unit.id)
    .eq("active", true)
    .not("status", "in", '("maintenance","out_of_service")')
    .order("display_order");
  return { unit, rooms: rooms ?? [] };
}

const requestSchema = z.object({
  room_id: z.string().uuid(),
  check_in: z.string().date(),
  check_out: z.string().date(),
  guest_name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(6).max(50),
  email: z.string().trim().max(160),
  guest_count: z.coerce.number().int().positive().max(20),
  // Honeypot: un campo que un visitante real nunca completa (queda oculto
  // por CSS). Si llega con contenido, es un bot y se descarta la solicitud.
  website: z.string().optional().default(""),
});

const RETURN_PATH = "/reservar/hostal-uruguay";

export async function submitPublicLodgingRequestAction(form: FormData) {
  const parsed = requestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    go(RETURN_PATH, "error", parsed.error.issues[0].message);
  const data = parsed.data;
  if (data.website) go(RETURN_PATH, "error", "No fue posible procesar la solicitud.");

  const file = form.get("receipt");
  if (!(file instanceof File) || file.size < 1 || file.size > 10_485_760)
    go(RETURN_PATH, "error", "El comprobante es inválido o supera 10 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = detectedMime(bytes);
  if (!mime)
    go(RETURN_PATH, "error", "Formato no permitido. Use PDF, JPG, PNG o WEBP.");

  const unit = await resolvePublicUnit();
  if (!unit) go(RETURN_PATH, "error", "El hostal no está disponible por ahora.");

  const db = createSupabaseAdminClient();
  const { data: room } = await db
    .from("lodging_rooms")
    .select("id,base_rate")
    .eq("id", data.room_id)
    .eq("business_unit_id", unit.id)
    .eq("active", true)
    .maybeSingle();
  if (!room) go(RETURN_PATH, "error", "La habitación seleccionada no está disponible.");

  let total: number;
  try {
    total = totalForStay({
      checkIn: data.check_in,
      checkOut: data.check_out,
      nightlyRate: Number(room.base_rate),
    });
  } catch (e) {
    go(RETURN_PATH, "error", e instanceof Error ? e.message : "Fechas inválidas.");
  }
  if (total <= 0) go(RETURN_PATH, "error", "El rango de fechas no es válido.");

  const { data: guest, error: guestError } = await db
    .from("lodging_guests")
    .insert({
      company_id: unit.company_id,
      business_unit_id: unit.id,
      full_name: data.guest_name,
      phone: data.phone,
      email: data.email || null,
    })
    .select("id")
    .single();
  if (guestError || !guest)
    go(RETURN_PATH, "error", "No fue posible registrar tus datos. Intenta nuevamente.");

  const { data: reservation, error: reservationError } = await db
    .from("lodging_reservations")
    .insert({
      company_id: unit.company_id,
      business_unit_id: unit.id,
      room_id: room.id,
      guest_id: guest.id,
      origin: "public_web",
      status: "pending",
      check_in: data.check_in,
      check_out: data.check_out,
      guest_count: data.guest_count,
      nightly_rate: room.base_rate,
      total_value: total,
      notes: "Solicitud enviada desde el sitio web.",
    })
    .select("id")
    .single();
  if (reservationError || !reservation) {
    await db.from("lodging_guests").delete().eq("id", guest.id);
    const conflict =
      reservationError?.code === "23P01" ||
      /conflict|exclusion/i.test(reservationError?.message ?? "");
    go(
      RETURN_PATH,
      "error",
      conflict
        ? "Esas fechas ya no están disponibles para esta habitación. Elige otras fechas."
        : "No fue posible crear la solicitud. Intenta nuevamente.",
    );
  }

  const { data: payment, error: paymentError } = await db
    .from("lodging_reservation_payments")
    .insert({
      company_id: unit.company_id,
      business_unit_id: unit.id,
      reservation_id: reservation.id,
      type: "total",
      payment_method: "transfer",
      amount: total,
      status: "pending",
      registered_by: null,
      notes: "Comprobante subido por el huésped desde el sitio web, pendiente de revisión.",
    })
    .select("id")
    .single();
  if (paymentError || !payment) {
    await db.from("lodging_reservations").delete().eq("id", reservation.id);
    await db.from("lodging_guests").delete().eq("id", guest.id);
    go(RETURN_PATH, "error", "No fue posible registrar el pago. Intenta nuevamente.");
  }

  const ext = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[mime];
  const internal = `${crypto.randomUUID()}.${ext}`;
  const path = `${unit.company_id}/${unit.id}/${payment.id}/${internal}`;
  const { error: uploadError } = await db.storage
    .from("lodging-payment-receipts")
    .upload(path, file, { contentType: mime, upsert: false });
  if (uploadError) {
    await db.from("lodging_reservation_payments").delete().eq("id", payment.id);
    await db.from("lodging_reservations").delete().eq("id", reservation.id);
    await db.from("lodging_guests").delete().eq("id", guest.id);
    go(RETURN_PATH, "error", "No fue posible subir el comprobante. Intenta nuevamente.");
  }

  const { error: receiptError } = await db.from("lodging_payment_receipts").insert({
    company_id: unit.company_id,
    business_unit_id: unit.id,
    payment_id: payment.id,
    original_name: file.name,
    internal_name: internal,
    private_path: path,
    mime_type: mime,
    size_bytes: file.size,
    uploaded_by: null,
  });
  if (receiptError) {
    await db.storage.from("lodging-payment-receipts").remove([path]);
    await db.from("lodging_reservation_payments").delete().eq("id", payment.id);
    await db.from("lodging_reservations").delete().eq("id", reservation.id);
    await db.from("lodging_guests").delete().eq("id", guest.id);
    go(RETURN_PATH, "error", "No fue posible registrar el comprobante. Intenta nuevamente.");
  }

  // El correo al staff es un efecto secundario: si Resend falla, la
  // solicitud ya quedó guardada y visible en el ERP de todos modos.
  await dispatchApprovalEmails().catch(() => {});

  revalidatePath("/lodging");
  go(RETURN_PATH, "success", "¡Recibimos tu solicitud! Te confirmaremos por WhatsApp o correo en las próximas horas.");
}

const reviewSchema = z.object({
  reservation_id: z.string().uuid(),
  decision: z.enum(["confirm", "reject"]),
});

export async function reviewPublicLodgingRequestAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/lodging/reservations");
  const { reservation_id, decision } = parsed.data;

  // review_lodging_public_request() (migración
  // 20260811120000_lodging_public_requests.sql) hace la transición de
  // reserva + pago en una sola transacción y revisa el permiso por dentro;
  // se llama con el cliente de sesión (no el admin) para que auth.uid()
  // resuelva al usuario real que confirma o rechaza.
  const s = await createSupabaseServerClient();
  const { error } = await s.rpc("review_lodging_public_request", {
    target_reservation: reservation_id,
    approve: decision === "confirm",
  });
  if (error)
    go(
      `/lodging/reservations/${reservation_id}`,
      "error",
      "Esta solicitud ya no está pendiente o no fue posible actualizarla.",
    );

  revalidatePath("/lodging");
  revalidatePath(`/lodging/reservations/${reservation_id}`);
  go(
    `/lodging/reservations/${reservation_id}`,
    "success",
    decision === "confirm"
      ? "Solicitud confirmada. La reserva quedó activa."
      : "Solicitud rechazada. La fecha volvió a quedar disponible.",
  );
}
