"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseIcal, totalForStay } from "../domain/reservations";
import { fetchIcal, assertSafeIcalUrl } from "./security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();
const text = z.string().trim().min(1);
const date = z.string().date();
const origins = z.enum([
  "direct",
  "whatsapp",
  "company",
  "booking",
  "airbnb",
  "other",
]);

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}
function allowedUnit(
  ctx: Awaited<ReturnType<typeof requirePermission>>,
  companyId: string,
  unitId: string,
) {
  return ctx.units.some((u) => u.id === unitId && u.company_id === companyId);
}

export async function createRoomAction(form: FormData) {
  const ctx = await requirePermission("lodging.rooms.manage");
  const parsed = z
    .object({
      company_id: uuid,
      business_unit_id: uuid,
      code: text.max(20),
      name: text.max(80),
      description: z.string().trim().max(300),
      capacity: z.coerce.number().int().positive(),
      base_rate: z.coerce.number().min(0),
      display_order: z.coerce.number().int().min(0),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    go("/lodging/rooms", "error", parsed.error.issues[0].message);
  if (!allowedUnit(ctx, parsed.data.company_id, parsed.data.business_unit_id))
    go("/lodging/rooms", "error", "Unidad no autorizada.");
  const s = await createSupabaseServerClient();
  const { error } = await s.from("lodging_rooms").insert(parsed.data);
  if (error)
    go(
      "/lodging/rooms",
      "error",
      error.code === "23505"
        ? "Ya existe una habitación con ese código."
        : "No fue posible crear la habitación.",
    );
  revalidatePath("/lodging");
  go("/lodging/rooms", "success", "Habitación creada correctamente.");
}

export async function updateRoomAction(form: FormData) {
  await requirePermission("lodging.rooms.manage");
  const id = uuid.parse(form.get("room_id"));
  const values = z
    .object({
      name: text.max(80),
      description: z.string().trim().max(300),
      capacity: z.coerce.number().int().positive(),
      base_rate: z.coerce.number().min(0),
      status: z.enum([
        "available",
        "occupied",
        "cleaning",
        "maintenance",
        "out_of_service",
      ]),
      display_order: z.coerce.number().int().min(0),
      active: z.enum(["true", "false"]).transform((v) => v === "true"),
    })
    .parse(Object.fromEntries(form));
  const s = await createSupabaseServerClient();
  const { error } = await s.from("lodging_rooms").update(values).eq("id", id);
  if (error)
    go(
      `/lodging/rooms?room=${id}`,
      "error",
      "No fue posible actualizar la habitación.",
    );
  revalidatePath("/lodging");
  go(
    `/lodging/rooms?room=${id}`,
    "success",
    "Habitación actualizada. La tarifa nueva solo aplica a futuras reservas directas.",
  );
}

export async function createReservationAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const parsed = z
    .object({
      room_id: uuid,
      guest_name: text.max(160),
      phone: text.max(50),
      email: z.string().trim().max(160),
      document: z.string().trim().max(80),
      check_in: date,
      check_out: date,
      guest_count: z.coerce.number().int().positive(),
      origin: origins,
      nightly_rate: z.coerce.number().min(0),
      discount: z.coerce.number().min(0),
      surcharge: z.coerce.number().min(0),
      company_name: z.string().trim().max(160),
      estimated_arrival: z.string().trim().max(8),
      notes: z.string().trim().max(1000),
      license_plate: z.string().trim().max(30),
      payment_option: z.enum(["none", "deposit", "total"]),
      payment_amount: z.coerce.number().min(0),
      payment_method: z.enum([
        "transfer",
        "cash",
        "card",
        "booking",
        "airbnb",
        "company",
        "other",
      ]),
      operation_number: z.string().trim().max(100),
      bank: z.string().trim().max(100),
      payment_notes: z.string().trim().max(300),
      main_reservation_id: z.string().optional().default(""),
      stay_group_id: z.string().optional().default(""),
      relation_type: z.string().optional().default(""),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    go("/lodging/reservations/new", "error", parsed.error.issues[0].message);
  let total: number;
  try {
    total = totalForStay({
      checkIn: parsed.data.check_in,
      checkOut: parsed.data.check_out,
      nightlyRate: parsed.data.nightly_rate,
      discount: parsed.data.discount,
      surcharge: parsed.data.surcharge,
    });
  } catch (e) {
    go(
      "/lodging/reservations/new",
      "error",
      e instanceof Error ? e.message : "Fechas inválidas.",
    );
  }
  const amount =
    parsed.data.payment_option === "none"
      ? 0
      : parsed.data.payment_option === "total"
        ? total
        : parsed.data.payment_amount;
  if (amount > total && parsed.data.payment_option !== "total")
    go(
      "/lodging/reservations/new",
      "error",
      "El abono supera el total de la reserva.",
    );
  const s = await createSupabaseServerClient();
  const { data, error } = await s.rpc("create_lodging_reservation", {
    payload: {
      ...parsed.data,
      total_value: total,
      payment_amount: amount,
      payment_type:
        parsed.data.payment_option === "total" ? "total" : "deposit",
      paid_at: new Date().toISOString(),
    },
  });
  if (error) {
    const conflict =
      error.code === "23P01" || /conflict|exclusion/i.test(error.message);
    go(
      "/lodging/reservations/new",
      "error",
      conflict
        ? "La habitación ya está reservada en esas fechas."
        : error.message.includes("capacidad")
          ? error.message
          : "No fue posible crear la reserva.",
    );
  }
  revalidatePath("/lodging");
  go(
    `/lodging/reservations/${data}`,
    "success",
    "Reserva creada correctamente.",
  );
}

export async function registerPaymentAction(form: FormData) {
  const ctx = await requirePermission("lodging.payments.manage");
  const parsed = z
    .object({
      reservation_id: uuid,
      company_id: uuid,
      business_unit_id: uuid,
      type: z.enum([
        "deposit",
        "partial",
        "total",
        "check_in",
        "check_out",
        "guarantee",
        "refund",
      ]),
      payment_method: z.enum([
        "transfer",
        "cash",
        "card",
        "booking",
        "airbnb",
        "company",
        "other",
      ]),
      amount: z.coerce.number().positive(),
      paid_at: z.string().datetime(),
      operation_number: z.string().trim().max(100),
      bank: z.string().trim().max(100),
      notes: z.string().trim().max(300),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    go(
      `/lodging/reservations/${form.get("reservation_id")}`,
      "error",
      parsed.error.issues[0].message,
    );
  if (!allowedUnit(ctx, parsed.data.company_id, parsed.data.business_unit_id))
    go("/lodging", "error", "Unidad no autorizada.");
  const s = await createSupabaseServerClient();
  const { data: current } = await s.rpc("lodging_payment_summary", {
    target_reservation: parsed.data.reservation_id,
  });
  const balance = Number(current?.[0]?.balance ?? 0);
  if (
    parsed.data.type !== "refund" &&
    parsed.data.amount > balance &&
    parsed.data.notes.length < 3
  )
    go(
      `/lodging/reservations/${parsed.data.reservation_id}`,
      "error",
      "Un pago superior al saldo requiere una observación.",
    );
  const { error } = await s
    .from("lodging_reservation_payments")
    .insert({ ...parsed.data, registered_by: ctx.user.id });
  if (error)
    go(
      `/lodging/reservations/${parsed.data.reservation_id}`,
      "error",
      "No fue posible registrar el pago.",
    );
  revalidatePath("/lodging");
  go(
    `/lodging/reservations/${parsed.data.reservation_id}`,
    "success",
    "Pago registrado correctamente.",
  );
}

export async function voidPaymentAction(form: FormData) {
  const ctx = await requirePermission("lodging.payments.void");
  const paymentId = uuid.parse(form.get("payment_id"));
  const reservationId = uuid.parse(form.get("reservation_id"));
  const reason = text.min(3).max(300).parse(form.get("void_reason"));
  const s = await createSupabaseServerClient();
  const { error } = await s
    .from("lodging_reservation_payments")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: ctx.user.id,
      void_reason: reason,
    })
    .eq("id", paymentId)
    .eq("status", "confirmed");
  if (error)
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "No fue posible anular el pago.",
    );
  revalidatePath(`/lodging/reservations/${reservationId}`);
  go(
    `/lodging/reservations/${reservationId}`,
    "success",
    "Pago anulado correctamente.",
  );
}

export async function updateImportedReservationInfoAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const reservationId = uuid.parse(form.get("reservation_id"));
  const guestId = uuid.parse(form.get("guest_id"));
  const guest = z
    .object({
      full_name: text.max(160),
      phone: text.max(50),
      email: z.string().trim().max(160),
      document: z.string().trim().max(80),
    })
    .parse(Object.fromEntries(form));
  const internal = z
    .object({
      guest_count: z.coerce.number().int().positive(),
      total_value: z.coerce.number().min(0),
      commission: z.coerce.number().min(0),
      estimated_arrival: z.string().trim().max(8),
      notes: z.string().trim().max(1000),
      license_plate: z.string().trim().max(30),
      company_name: z.string().trim().max(160),
    })
    .parse(Object.fromEntries(form));
  const s = await createSupabaseServerClient();
  const { data: reservation } = await s
    .from("lodging_reservations")
    .select("imported_from_ical")
    .eq("id", reservationId)
    .single();
  if (!reservation?.imported_from_ical)
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "Esta acción es solo para reservas importadas.",
    );
  const { error: guestError } = await s
    .from("lodging_guests")
    .update({
      ...guest,
      email: guest.email || null,
      document: guest.document || null,
    })
    .eq("id", guestId);
  const { error: reservationError } = await s
    .from("lodging_reservations")
    .update({
      ...internal,
      estimated_arrival: internal.estimated_arrival || null,
      information_complete: true,
    })
    .eq("id", reservationId);
  if (guestError || reservationError)
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "No fue posible completar la información interna.",
    );
  revalidatePath(`/lodging/reservations/${reservationId}`);
  go(
    `/lodging/reservations/${reservationId}`,
    "success",
    "Información interna actualizada correctamente.",
  );
}

function detectedMime(bytes: Uint8Array) {
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
    return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
export async function uploadPaymentReceiptAction(form: FormData) {
  const ctx = await requirePermission("lodging.payments.manage");
  const paymentId = uuid.parse(form.get("payment_id"));
  const reservationId = uuid.parse(form.get("reservation_id"));
  const companyId = uuid.parse(form.get("company_id"));
  const unitId = uuid.parse(form.get("business_unit_id"));
  const file = form.get("receipt");
  if (!(file instanceof File) || file.size < 1 || file.size > 10_485_760)
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "El comprobante es inválido o supera 10 MB.",
    );
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = detectedMime(bytes);
  if (!mime)
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "Formato no permitido. Use PDF, JPG, PNG o WEBP.",
    );
  const ext = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[mime];
  const internal = `${crypto.randomUUID()}.${ext}`;
  const path = `${companyId}/${unitId}/${paymentId}/${internal}`;
  const s = await createSupabaseServerClient();
  const { error: uploadError } = await s.storage
    .from("lodging-payment-receipts")
    .upload(path, file, { contentType: mime, upsert: false });
  if (uploadError)
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "No fue posible subir el comprobante.",
    );
  const { error } = await s.from("lodging_payment_receipts").insert({
    company_id: companyId,
    business_unit_id: unitId,
    payment_id: paymentId,
    original_name: file.name,
    internal_name: internal,
    private_path: path,
    mime_type: mime,
    size_bytes: file.size,
    uploaded_by: ctx.user.id,
  });
  if (error) {
    await s.storage.from("lodging-payment-receipts").remove([path]);
    go(
      `/lodging/reservations/${reservationId}`,
      "error",
      "No fue posible registrar el comprobante.",
    );
  }
  revalidatePath(`/lodging/reservations/${reservationId}`);
  go(
    `/lodging/reservations/${reservationId}`,
    "success",
    "Comprobante adjuntado correctamente.",
  );
}
export async function openPaymentReceiptAction(form: FormData) {
  await requirePermission("lodging.reservations.view");
  const path = text.parse(form.get("path"));
  if (path.includes("..")) redirect("/lodging");
  const s = await createSupabaseServerClient();
  const { data: receipt } = await s
    .from("lodging_payment_receipts")
    .select("id")
    .eq("private_path", path)
    .maybeSingle();
  if (!receipt) redirect("/lodging");
  const { data } = await s.storage
    .from("lodging-payment-receipts")
    .createSignedUrl(path, 300);
  redirect(data?.signedUrl ?? "/lodging");
}

export async function checkInAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const id = uuid.parse(form.get("reservation_id"));
  const room = uuid.parse(form.get("room_id"));
  const s = await createSupabaseServerClient();
  const { error } = await s
    .from("lodging_reservations")
    .update({ status: "checked_in", actual_check_in: new Date().toISOString() })
    .eq("id", id);
  if (!error)
    await s.from("lodging_rooms").update({ status: "occupied" }).eq("id", room);
  if (error)
    go(
      `/lodging/reservations/${id}`,
      "error",
      "No fue posible realizar el check-in.",
    );
  revalidatePath("/lodging");
  go(
    `/lodging/reservations/${id}`,
    "success",
    "Check-in realizado correctamente.",
  );
}
export async function checkOutAction(form: FormData) {
  await requirePermission("lodging.reservations.manage");
  const id = uuid.parse(form.get("reservation_id"));
  const room = uuid.parse(form.get("room_id"));
  const s = await createSupabaseServerClient();
  const { data: summary } = await s.rpc("lodging_payment_summary", {
    target_reservation: id,
  });
  const balance = Number(summary?.[0]?.balance ?? 0);
  if (balance > 0)
    go(
      `/lodging/reservations/${id}`,
      "error",
      "No se puede realizar check-out con saldo pendiente.",
    );
  const { error } = await s
    .from("lodging_reservations")
    .update({
      status: "checked_out",
      actual_check_out: new Date().toISOString(),
    })
    .eq("id", id);
  if (!error)
    await s.from("lodging_rooms").update({ status: "cleaning" }).eq("id", room);
  if (error)
    go(
      `/lodging/reservations/${id}`,
      "error",
      "No fue posible realizar el check-out.",
    );
  revalidatePath("/lodging");
  go(
    `/lodging/reservations/${id}`,
    "success",
    "Check-out realizado. Habitación en limpieza.",
  );
}

export async function saveIcalConfigAction(form: FormData) {
  const ctx = await requirePermission("lodging.ical.configure");
  const parsed = z
    .object({
      company_id: uuid,
      business_unit_id: uuid,
      room_id: uuid,
      provider: z.enum(["booking", "airbnb", "other"]),
      name: text.max(100),
      import_url: z.string().url(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) go("/lodging/ical", "error", "Configuración inválida.");
  if (!allowedUnit(ctx, parsed.data.company_id, parsed.data.business_unit_id))
    go("/lodging/ical", "error", "Unidad no autorizada.");
  try {
    await assertSafeIcalUrl(parsed.data.import_url);
    parseIcal(await fetchIcal(parsed.data.import_url));
  } catch {
    go(
      "/lodging/ical",
      "error",
      "El calendario no es válido o no es accesible.",
    );
  }
  const s = await createSupabaseServerClient();
  const { error } = await s.from("lodging_ical_configs").insert(parsed.data);
  if (error)
    go("/lodging/ical", "error", "No fue posible guardar el calendario.");
  revalidatePath("/lodging/ical");
  go("/lodging/ical", "success", "Calendario configurado correctamente.");
}

export async function synchronizeCalendars(unitId: string) {
  const ctx = await requirePermission("lodging.ical.sync");
  if (!ctx.units.some((u) => u.id === unitId)) return { ok: false as const };
  try {
    await synchronizeUnit(unitId);
    revalidatePath("/lodging");
    return { ok: true as const, at: new Date().toISOString() };
  } catch (e) {
    console.error(
      "Fallo de sincronización iCal",
      e instanceof Error ? e.message : "Error",
    );
    return { ok: false as const };
  }
}

export async function synchronizeUnit(unitId?: string) {
  const db = createSupabaseAdminClient();
  let query = db.from("lodging_ical_configs").select("*").eq("active", true);
  if (unitId) query = query.eq("business_unit_id", unitId);
  const { data: configs, error } = await query;
  if (error) throw error;
  for (const config of configs ?? []) {
    const started = new Date().toISOString();
    const staleLock = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: claimed } = await db
      .from("lodging_ical_configs")
      .update({ sync_locked_at: started })
      .eq("id", config.id)
      .or(`sync_locked_at.is.null,sync_locked_at.lt.${staleLock}`)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    let read = 0,
      created = 0,
      updated = 0,
      conflicts = 0;
    try {
      const ics = await fetchIcal(config.import_url);
      const events = parseIcal(ics);
      read = events.length;
      const seen: string[] = [];
      for (const event of events) {
        seen.push(`${event.uid}|${event.recurrenceId}`);
        const hash = await crypto.subtle
          .digest("SHA-256", new TextEncoder().encode(JSON.stringify(event)))
          .then((x) => Buffer.from(x).toString("hex"));
        const { data: existing } = await db
          .from("lodging_ical_events")
          .select("id,reservation_id,raw_hash")
          .eq("config_id", config.id)
          .eq("uid", event.uid)
          .eq("recurrence_id", event.recurrenceId)
          .maybeSingle();
        if (event.status === "CANCELLED" && existing?.reservation_id) {
          await db
            .from("lodging_reservations")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
            })
            .eq("id", existing.reservation_id);
        } else if (existing) {
          if (existing.raw_hash !== hash) {
            const { error: updateError } = await db
              .from("lodging_reservations")
              .update({
                check_in: event.start,
                check_out: event.end,
                raw_summary: event.summary,
              })
              .eq("id", existing.reservation_id);
            if (updateError) {
              conflicts++;
              await db
                .from("lodging_reservations")
                .update({ status: "conflict" })
                .eq("id", existing.reservation_id);
            }
            updated++;
          }
        } else {
          const origin = config.provider;
          const { data: importedGuest, error: guestError } = await db
            .from("lodging_guests")
            .insert({
              company_id: config.company_id,
              business_unit_id: config.business_unit_id,
              full_name: `Reserva ${origin === "booking" ? "Booking" : origin === "airbnb" ? "Airbnb" : "externa"} — información pendiente`,
              phone: "Pendiente",
            })
            .select("id")
            .single();
          if (guestError) throw guestError;
          const reservation = {
            company_id: config.company_id,
            business_unit_id: config.business_unit_id,
            room_id: config.room_id,
            guest_id: importedGuest.id,
            origin,
            status: "confirmed",
            check_in: event.start,
            check_out: event.end,
            guest_count: 1,
            nightly_rate: 0,
            total_value: 0,
            external_uid: event.uid,
            external_calendar_id: config.id,
            external_source: origin,
            imported_from_ical: true,
            raw_summary: event.summary,
            information_complete: false,
          };
          let { data: r, error: insertError } = await db
            .from("lodging_reservations")
            .insert(reservation)
            .select("id")
            .single();
          if (insertError) {
            conflicts++;
            ({ data: r, error: insertError } = await db
              .from("lodging_reservations")
              .insert({ ...reservation, status: "conflict" })
              .select("id")
              .single());
          }
          if (insertError) throw insertError;
          await db.from("lodging_ical_events").insert({
            config_id: config.id,
            room_id: config.room_id,
            uid: event.uid,
            recurrence_id: event.recurrenceId,
            starts_on: event.start,
            ends_on: event.end,
            summary: event.summary,
            status: event.status,
            raw_hash: hash,
            reservation_id: r!.id,
            last_seen_at: new Date().toISOString(),
          });
          created++;
          continue;
        }
        await db
          .from("lodging_ical_events")
          .update({
            starts_on: event.start,
            ends_on: event.end,
            summary: event.summary,
            status: event.status,
            raw_hash: hash,
            last_seen_at: new Date().toISOString(),
            missing_since: null,
          })
          .eq("config_id", config.id)
          .eq("uid", event.uid)
          .eq("recurrence_id", event.recurrenceId);
      }
      const { data: known } = await db
        .from("lodging_ical_events")
        .select("id,uid,recurrence_id,missing_since")
        .eq("config_id", config.id);
      for (const item of known ?? [])
        if (
          !seen.includes(`${item.uid}|${item.recurrence_id}`) &&
          !item.missing_since
        )
          await db
            .from("lodging_ical_events")
            .update({ missing_since: new Date().toISOString() })
            .eq("id", item.id);
      await db
        .from("lodging_ical_configs")
        .update({
          last_sync_at: new Date().toISOString(),
          last_result: "ok",
          last_error: null,
          consecutive_failures: 0,
          sync_locked_at: null,
        })
        .eq("id", config.id);
      await db.from("lodging_sync_logs").insert({
        company_id: config.company_id,
        business_unit_id: config.business_unit_id,
        config_id: config.id,
        started_at: started,
        finished_at: new Date().toISOString(),
        result: "ok",
        events_read: read,
        events_created: created,
        events_updated: updated,
        conflicts_detected: conflicts,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 500) : "Error";
      await db
        .from("lodging_ical_configs")
        .update({
          last_sync_at: new Date().toISOString(),
          last_result: "error",
          last_error: message,
          consecutive_failures: (config.consecutive_failures ?? 0) + 1,
          sync_locked_at: null,
        })
        .eq("id", config.id);
      await db.from("lodging_sync_logs").insert({
        company_id: config.company_id,
        business_unit_id: config.business_unit_id,
        config_id: config.id,
        started_at: started,
        finished_at: new Date().toISOString(),
        result: "error",
        error_message: message,
      });
    }
  }
}
