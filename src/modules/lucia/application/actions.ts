"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { normalizePhoneNumber } from "@/modules/whatsapp/domain/phone";
import { supportedLuciaModels } from "@/modules/lucia/domain/pricing";
import { processLuciaConversation } from "./process";

const BASE = "/lodging/lucia";
const uuid = z.string().uuid();

function back(path: string, type: "success" | "error", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${type}=${encodeURIComponent(message)}`);
}
function friendly(error: { message?: string } | null) {
  const value = error?.message ?? "No fue posible completar la operación.";
  if (/permission denied|row-level/i.test(value)) return "No tienes autorización para esta acción.";
  return value;
}
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

// ===== Bandeja =====

async function conversationRpc(
  form: FormData,
  fn: string,
  args: (id: string) => Record<string, unknown>,
  success: string,
) {
  await requirePermission("lucia.inbox.reply");
  const id = uuid.parse(form.get("conversation_id"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args(id));
  const path = `${BASE}/${id}`;
  if (error) back(path, "error", friendly(error));
  revalidatePath(path);
  back(path, "success", success);
}

export async function sendDraftAction(form: FormData) {
  const draftId = uuid.parse(form.get("draft_id"));
  await conversationRpc(
    form,
    "lucia_send_draft",
    () => ({ target_draft: draftId, final_content: text(form, "content") }),
    "Mensaje enviado. En WhatsApp sale en unos segundos, con pausa de \"escribiendo…\".",
  );
}

export async function discardDraftAction(form: FormData) {
  const draftId = uuid.parse(form.get("draft_id"));
  await conversationRpc(form, "lucia_discard_draft", () => ({ target_draft: draftId }), "Borrador descartado.");
}

export async function sendReplyAction(form: FormData) {
  await conversationRpc(
    form,
    "lucia_send_reply",
    (id) => ({ target_conversation: id, body: text(form, "content") }),
    "Respuesta enviada.",
  );
}

export async function takeControlAction(form: FormData) {
  await conversationRpc(form, "lucia_take_control", (id) => ({ target_conversation: id }), "Tomaste el control: Lucía queda pausada en este chat.");
}

export async function releaseControlAction(form: FormData) {
  await conversationRpc(form, "lucia_release_control", (id) => ({ target_conversation: id }), "Lucía vuelve a atender este chat.");
}

export async function markReviewedAction(form: FormData) {
  await conversationRpc(form, "lucia_mark_reviewed", (id) => ({ target_conversation: id }), "Marcado como revisado.");
}

export async function closeConversationAction(form: FormData) {
  await conversationRpc(form, "lucia_close_conversation", (id) => ({ target_conversation: id }), "Conversación cerrada.");
}

const prospectSchema = z.object({
  prospect_status: z.enum(["new", "quoted", "pre_reserved", "confirmed", "lost"]),
  business_unit_id: z.union([z.literal(""), z.string().uuid()]),
  contact_name: z.string().max(160),
  guest_name: z.string().max(160),
  check_in: z.union([z.literal(""), z.string().date()]),
  check_out: z.union([z.literal(""), z.string().date()]),
  guests: z.union([z.literal(""), z.coerce.number().int().min(1).max(60)]),
  room_type: z.string().max(120),
  preferences: z.string().max(500),
  quoted_amount: z.union([z.literal(""), z.coerce.number().min(0).max(999_999_999)]),
});

export async function updateProspectAction(form: FormData) {
  const fields = Object.fromEntries(
    Object.keys(prospectSchema.shape).map((key) => [key, text(form, key)]),
  );
  const parsed = prospectSchema.safeParse(fields);
  const id = uuid.parse(form.get("conversation_id"));
  if (!parsed.success) back(`${BASE}/${id}`, "error", parsed.error.issues[0]?.message ?? "Datos inválidos.");
  if (parsed.data.check_in && parsed.data.check_out && parsed.data.check_out <= parsed.data.check_in)
    back(`${BASE}/${id}`, "error", "La salida debe ser posterior a la llegada.");
  await conversationRpc(
    form,
    "lucia_update_prospect",
    () => ({ target_conversation: id, payload: { ...parsed.data, guests: String(parsed.data.guests), quoted_amount: String(parsed.data.quoted_amount) } }),
    "Ficha actualizada.",
  );
}

// ===== Reserva y pago =====

export async function confirmBookingAction(form: FormData) {
  const room = String(form.get("room_id") ?? "");
  await conversationRpc(
    form,
    "lucia_booking_confirm",
    (id) => ({ target_conversation: id, target_room: room ? uuid.parse(room) : null }),
    "Disponibilidad confirmada: se creó la reserva pendiente y Lucía envió al cliente el monto y los datos de pago.",
  );
}

export async function rejectBookingAction(form: FormData) {
  await conversationRpc(form, "lucia_booking_reject", (id) => ({ target_conversation: id }), "Lucía le avisó al cliente que no hay disponibilidad.");
}

export async function verifyPaymentAction(form: FormData) {
  const id = uuid.parse(form.get("conversation_id"));
  const amount = z.coerce.number().positive().max(999_999_999).safeParse(form.get("amount"));
  if (!amount.success) back(`${BASE}/${id}`, "error", "Indica el monto recibido.");
  await conversationRpc(
    form,
    "lucia_verify_payment",
    () => ({ target_conversation: id, paid_amount: amount.data, operation: text(form, "operation") }),
    "Pago registrado y reserva confirmada. Lucía le avisó al cliente.",
  );
}

// ===== Simulador =====

export async function startSimulationAction(form: FormData) {
  await requirePermission("lucia.settings.manage");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lucia_simulator_start", {
    contact: text(form, "contact_name"),
  });
  if (error) back(`${BASE}/simulador`, "error", friendly(error));
  redirect(`${BASE}/${data}`);
}

export async function simulateCustomerMessageAction(form: FormData) {
  await requirePermission("lucia.settings.manage");
  const id = uuid.parse(form.get("conversation_id"));
  const path = `${BASE}/${id}`;
  const supabase = await createSupabaseServerClient();
  // La función valida permiso, acceso y que sea una conversación de prueba.
  const { error } = await supabase.rpc("lucia_simulator_customer_message", {
    target_conversation: id,
    body: text(form, "content"),
  });
  if (error) back(path, "error", friendly(error));
  const result = await processLuciaConversation(createSupabaseAdminClient(), id);
  revalidatePath(path);
  if (result.status === "error") back(path, "error", `Lucía no pudo responder: ${result.message}`);
  if (result.status === "skipped")
    back(path, "success", "Mensaje registrado. Lucía no redactó respuesta (chat pausado o tomado).");
  back(
    path,
    "success",
    result.autoSent ? "Lucía respondió automáticamente." : "Lucía preparó un borrador para revisar.",
  );
}

// ===== Configuración =====

const SETTINGS_PATH = `${BASE}/configuracion`;

const settingsSchema = z.object({
  agent_name: z.string().trim().min(1, "Indica el nombre de la asistente.").max(60),
  general_instructions: z.string().max(20000),
  model: z.enum(supportedLuciaModels as [string, ...string[]]),
  daily_budget_usd: z.coerce.number().min(0).max(1000),
  max_messages_per_minute: z.coerce.number().int().min(1).max(30),
  history_messages: z.coerce.number().int().min(1).max(50),
});

export async function saveSettingsAction(form: FormData) {
  const { user } = await requirePermission("lucia.settings.manage");
  const parsed = settingsSchema.safeParse({
    agent_name: form.get("agent_name"),
    general_instructions: form.get("general_instructions") ?? "",
    model: form.get("model"),
    daily_budget_usd: form.get("daily_budget_usd"),
    max_messages_per_minute: form.get("max_messages_per_minute"),
    history_messages: form.get("history_messages"),
  });
  if (!parsed.success) back(SETTINGS_PATH, "error", parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lucia_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", uuid.parse(form.get("settings_id")))
    .select("id");
  if (error || !data?.length) back(SETTINGS_PATH, "error", friendly(error));
  revalidatePath(SETTINGS_PATH);
  back(SETTINGS_PATH, "success", "Configuración guardada.");
}

const hostelSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
  manual: z.string().max(40000),
  manager_name: z.string().trim().max(120),
  manager_phone: z.string().trim().max(20),
  mode: z.enum(["draft", "auto"]),
  payment_instructions: z.string().trim().max(2000),
  deposit_percent: z.coerce.number().int().min(1).max(100),
  hold_minutes: z.coerce.number().int().min(15).max(1440),
  checkin_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora de check-in inválida."),
  checkout_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora de check-out inválida."),
  photos_url: z.union([z.literal(""), z.string().trim().url("El link de fotos no es válido.").max(500)]),
});

export async function saveHostelAction(form: FormData) {
  const { user } = await requirePermission("lucia.settings.manage");
  const unitId = uuid.parse(form.get("business_unit_id"));
  const parsed = hostelSchema.safeParse({
    display_name: form.get("display_name"),
    manual: form.get("manual") ?? "",
    manager_name: form.get("manager_name") ?? "",
    manager_phone: form.get("manager_phone") ?? "",
    mode: form.get("mode"),
    payment_instructions: form.get("payment_instructions") ?? "",
    deposit_percent: form.get("deposit_percent") ?? 50,
    hold_minutes: form.get("hold_minutes") ?? 60,
    checkin_time: form.get("checkin_time") ?? "14:00",
    checkout_time: form.get("checkout_time") ?? "12:00",
    photos_url: String(form.get("photos_url") ?? "").trim(),
  });
  if (!parsed.success) back(SETTINGS_PATH, "error", parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const phone = parsed.data.manager_phone ? normalizePhoneNumber(parsed.data.manager_phone) : null;
  if (parsed.data.manager_phone && !phone)
    back(SETTINGS_PATH, "error", "El WhatsApp del encargado no es válido (usa formato +56 9 ...).");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lucia_hostels")
    .update({
      ...parsed.data,
      manager_name: parsed.data.manager_name || null,
      manager_phone: phone,
      photos_url: parsed.data.photos_url || null,
      full_payment_single_night: form.get("full_payment_single_night") === "on",
      enabled: form.get("enabled") === "on",
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("business_unit_id", unitId)
    .select("business_unit_id");
  if (error || !data?.length) back(SETTINGS_PATH, "error", friendly(error));
  revalidatePath(SETTINGS_PATH);
  back(SETTINGS_PATH, "success", `${parsed.data.display_name}: guardado.`);
}

const excludedSchema = z.object({
  label: z.string().trim().min(1, "Indica a quién corresponde el número.").max(120),
  category: z.enum(["familia", "equipo", "encargado", "otro"]),
});

export async function addExcludedContactAction(form: FormData) {
  const { user } = await requirePermission("lucia.settings.manage");
  const phone = normalizePhoneNumber(text(form, "phone"));
  if (!phone) back(SETTINGS_PATH, "error", "Número inválido (usa formato +56 9 ...).");
  const parsed = excludedSchema.safeParse({ label: form.get("label"), category: form.get("category") });
  if (!parsed.success) back(SETTINGS_PATH, "error", parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("lucia_settings")
    .select("company_id,business_unit_id")
    .single();
  if (!settings) back(SETTINGS_PATH, "error", "Lucía no está configurada.");
  const { error } = await supabase.from("lucia_excluded_contacts").insert({
    company_id: settings.company_id,
    business_unit_id: settings.business_unit_id,
    phone_e164: phone,
    ...parsed.data,
    created_by: user.id,
  });
  if (error)
    back(SETTINGS_PATH, "error", error.code === "23505" ? "Ese número ya está excluido." : friendly(error));
  revalidatePath(SETTINGS_PATH);
  back(SETTINGS_PATH, "success", "Contacto excluido: Lucía no le responderá.");
}

export async function removeExcludedContactAction(form: FormData) {
  await requirePermission("lucia.settings.manage");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lucia_excluded_contacts")
    .delete()
    .eq("id", uuid.parse(form.get("id")))
    .select("id");
  if (error || !data?.length) back(SETTINGS_PATH, "error", friendly(error));
  revalidatePath(SETTINGS_PATH);
  back(SETTINGS_PATH, "success", "Contacto quitado de la lista de excluidos.");
}

// ===== Fotos de habitaciones =====

const PHOTOS_PATH = `${BASE}/fotos`;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function uploadRoomPhotosAction(form: FormData) {
  await requirePermission("lucia.settings.manage");
  const unitId = uuid.parse(form.get("business_unit_id"));
  const roomType = text(form, "room_type");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!roomType) back(PHOTOS_PATH, "error", "Elige el tipo de habitación.");
  if (!files.length) back(PHOTOS_PATH, "error", "Selecciona al menos una foto.");
  // Vercel acepta hasta ~4,5 MB por envío de formulario.
  if (files.reduce((sum, f) => sum + f.size, 0) > 4 * 1024 * 1024)
    back(PHOTOS_PATH, "error", "Las fotos suman más de 4 MB: súbelas de a una o en menor tamaño.");
  const supabase = await createSupabaseServerClient();
  const { data: hostel } = await supabase.from("lucia_hostels").select("company_id").eq("business_unit_id", unitId).maybeSingle();
  if (!hostel) back(PHOTOS_PATH, "error", "Hostal no autorizada.");
  const admin = createSupabaseAdminClient();
  let added = 0;
  for (const file of files) {
    const ext = PHOTO_TYPES[file.type];
    if (!ext) back(PHOTOS_PATH, "error", `${file.name}: solo se aceptan fotos JPG, PNG o WEBP.`);
    const path = `${hostel.company_id}/${unitId}/${crypto.randomUUID()}.${ext}`;
    // Se sube con la clave de servicio; la función valida permiso, hostal y tipo.
    const { error: uploadError } = await admin.storage.from("lucia-photos").upload(path, file, { contentType: file.type });
    if (uploadError) back(PHOTOS_PATH, "error", `No se pudo subir ${file.name}.`);
    const { error } = await supabase.rpc("lucia_photo_add", {
      target_unit: unitId,
      photo_room_type: roomType,
      photo_path: path,
      mime: file.type,
      photo_size: file.size,
    });
    if (error) {
      await admin.storage.from("lucia-photos").remove([path]);
      back(PHOTOS_PATH, "error", friendly(error));
    }
    added++;
  }
  revalidatePath(PHOTOS_PATH);
  back(PHOTOS_PATH, "success", `${added} foto${added === 1 ? "" : "s"} agregada${added === 1 ? "" : "s"} a ${roomType}.`);
}

export async function removeRoomPhotoAction(form: FormData) {
  await requirePermission("lucia.settings.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lucia_photo_remove", { target_photo: uuid.parse(form.get("id")) });
  if (error) back(PHOTOS_PATH, "error", friendly(error));
  revalidatePath(PHOTOS_PATH);
  back(PHOTOS_PATH, "success", "Foto eliminada.");
}

// ===== Preguntas a recepción =====

// Dentro del ERP o en la página aislada; solo esas dos rutas (sin redirecciones abiertas).
const QUESTIONS_PATHS = [`${BASE}/preguntas`, "/preguntas-recepcion"] as const;

export async function saveStaffAnswerAction(form: FormData) {
  await requirePermission("lucia.inbox.reply");
  const returnTo = text(form, "return_to");
  const QUESTIONS_PATH = QUESTIONS_PATHS.find((p) => p === returnTo) ?? QUESTIONS_PATHS[0];
  const hostel = text(form, "hostel_code").replace(/[^A-Z]/g, "");
  const code = text(form, "question_code").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // «Correcto» confirma el dato del recuadro sin escribir nada.
  const answer = text(form, "quick") || text(form, "answer");
  const path = (type: "success" | "error", message: string) =>
    `${QUESTIONS_PATH}?hostal=${hostel}&${type}=${encodeURIComponent(message)}#${code}`;
  if (!answer) redirect(path("error", `Escribe una respuesta para ${code} antes de guardar.`));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lucia_save_staff_answer", {
    payload: { question_code: code, business_unit_id: uuid.parse(form.get("business_unit_id")), answer },
  });
  if (error) redirect(path("error", friendly(error)));
  revalidatePath(QUESTIONS_PATH);
  redirect(path("success", `Respuesta ${code} guardada.`));
}
