"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supportedLuciaModels } from "@/modules/lucia/domain/pricing";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { processDistConversation } from "./process";

const PATH = "/finance/distribution/assistant";

function back(key: "success" | "error", message: string): never {
  redirect(`${PATH}?${key}=${encodeURIComponent(message)}`);
}

const settingsSchema = z.object({
  agent_name: z.string().trim().min(1, "Indica el nombre del asistente.").max(60),
  general_instructions: z.string().max(20000),
  model: z.enum(supportedLuciaModels as [string, ...string[]]),
  daily_budget_usd: z.coerce.number().min(0).max(1000),
  same_day_cutoff: z.string().regex(/^\d{2}:\d{2}$/, "La hora límite no es válida."),
  max_quantity_per_line: z.coerce.number().int().min(1).max(100000),
  max_order_total: z.coerce.number().int().min(0),
  acting_user_id: z.union([z.literal(""), z.string().uuid()]),
  notify_phones: z.string().max(400),
  ignored_phones: z.string().max(4000),
  pause_minutes: z.coerce.number().int().min(5).max(1440),
  max_messages_per_minute: z.coerce.number().int().min(1).max(30),
});

const splitPhones = (text: string) => text.split(/[\n,;]+/).map((p) => p.trim().replace(/[\s()-]/g, "")).filter(Boolean);

/** Guarda los ajustes del asistente: la base valida permiso, unidad, usuario firmante y números. */
export async function saveDistSettingsAction(form: FormData) {
  const ctx = await requirePermission("distribution.assistant.settings");
  const unit = ctx.units.find((u) => u.code === "DA");
  if (!unit) back("error", "No tienes acceso a la distribuidora.");
  const parsed = settingsSchema.safeParse({
    agent_name: form.get("agent_name"),
    general_instructions: form.get("general_instructions") ?? "",
    model: form.get("model"),
    daily_budget_usd: form.get("daily_budget_usd"),
    same_day_cutoff: form.get("same_day_cutoff"),
    max_quantity_per_line: form.get("max_quantity_per_line"),
    max_order_total: String(form.get("max_order_total") ?? "").replace(/\./g, ""),
    acting_user_id: form.get("acting_user_id") ?? "",
    notify_phones: form.get("notify_phones") ?? "",
    ignored_phones: form.get("ignored_phones") ?? "",
    pause_minutes: form.get("pause_minutes"),
    max_messages_per_minute: form.get("max_messages_per_minute"),
  });
  if (!parsed.success) back("error", parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const weekdays = form.getAll("delivery_weekdays").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  if (!weekdays.length) back("error", "Elige al menos un día de reparto.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("dist_wa_save_settings", {
    payload: {
      business_unit_id: unit.id,
      enabled: form.get("enabled") === "on",
      agent_name: parsed.data.agent_name,
      general_instructions: parsed.data.general_instructions,
      model: parsed.data.model,
      daily_budget_usd: parsed.data.daily_budget_usd,
      same_day_cutoff: parsed.data.same_day_cutoff,
      delivery_weekdays: weekdays,
      max_quantity_per_line: parsed.data.max_quantity_per_line,
      max_order_total: parsed.data.max_order_total,
      acting_user_id: parsed.data.acting_user_id || null,
      notify_phones: splitPhones(parsed.data.notify_phones),
      ignored_phones: splitPhones(parsed.data.ignored_phones),
      pause_minutes: parsed.data.pause_minutes,
      max_messages_per_minute: parsed.data.max_messages_per_minute,
    },
  });
  if (error) back("error", /autoriz/i.test(error.message) ? "No tienes autorización para esta acción." : error.message);
  revalidatePath(PATH);
  back("success", "Ajustes del asistente guardados.");
}

const phoneInput = z.union([z.literal(""), z.string().regex(/^\+?[0-9\s()-]{8,20}$/, "El teléfono no es válido.")]);

/** Simulador: un mensaje del cliente ficticio. Todo se prueba, pero nunca queda un pedido en el ERP. */
export async function simulateDistMessageAction(form: FormData) {
  const ctx = await requirePermission("distribution.assistant.settings");
  const unit = ctx.units.find((u) => u.code === "DA");
  if (!unit) back("error", "No tienes acceso a la distribuidora.");
  const text = String(form.get("content") ?? "").trim();
  if (!text) back("error", "Escribe el mensaje del cliente.");
  const phoneParsed = phoneInput.safeParse(String(form.get("contact_phone") ?? "").trim());
  if (!phoneParsed.success) back("error", phoneParsed.error.issues[0].message);
  const digits = phoneParsed.data.replace(/\D/g, "");
  const contactPhone = digits ? `+${digits.length === 9 ? "56" + digits : digits}` : null;
  const admin = createSupabaseAdminClient();
  const jid = `simulator:${ctx.user.id}`;

  const { data: existing } = await admin
    .from("dist_wa_conversations")
    .select("id,contact_phone")
    .eq("business_unit_id", unit.id)
    .eq("channel", "simulator")
    .eq("contact_jid", jid)
    .neq("status", "closed")
    .maybeSingle();
  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error } = await admin
      .from("dist_wa_conversations")
      .insert({ company_id: unit.company_id, business_unit_id: unit.id, channel: "simulator", contact_jid: jid, contact_phone: contactPhone, contact_name: "Cliente de prueba", created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !created) back("error", "No se pudo iniciar la simulación.");
    conversationId = created.id;
  } else if (contactPhone && existing?.contact_phone !== contactPhone) {
    await admin.from("dist_wa_conversations").update({ contact_phone: contactPhone, customer_id: null }).eq("id", conversationId);
  }
  await admin.from("dist_wa_messages").insert({
    company_id: unit.company_id,
    business_unit_id: unit.id,
    conversation_id: conversationId,
    direction: "inbound",
    sender_type: "customer",
    content: text,
    delivery_status: "received",
  });
  const result = await processDistConversation(admin, conversationId as string);
  revalidatePath(PATH);
  if (result.status === "error") back("error", `El asistente no pudo responder: ${result.message}`);
  if (result.status === "skipped") back("success", `Mensaje registrado. El asistente no respondió (${result.reason}).`);
  redirect(PATH);
}

/** Cierra la conversación de prueba para empezar otra desde cero. */
export async function resetDistSimulationAction() {
  const ctx = await requirePermission("distribution.assistant.settings");
  const unit = ctx.units.find((u) => u.code === "DA");
  if (!unit) back("error", "No tienes acceso a la distribuidora.");
  const admin = createSupabaseAdminClient();
  await admin
    .from("dist_wa_conversations")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("business_unit_id", unit.id)
    .eq("channel", "simulator")
    .eq("contact_jid", `simulator:${ctx.user.id}`)
    .neq("status", "closed");
  revalidatePath(PATH);
  back("success", "Conversación de prueba cerrada. Puedes empezar otra.");
}
