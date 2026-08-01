"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { whatsappContext } from "@/modules/whatsapp/application/queries";
import { integrationSettingsSchema } from "@/modules/whatsapp/application/schemas";

const uuid = z.string().uuid();
const RETURN_PATH = "/whatsapp/settings";

function done(type: "success" | "error", message: string): never {
  redirect(`${RETURN_PATH}?${type}=${encodeURIComponent(message)}`);
}
function errorMessage(error: { message?: string } | null) {
  const value = error?.message ?? "No fue posible completar la operación.";
  if (/autoriz|permission|row-level/i.test(value))
    return "No tienes autorización para esta acción.";
  return value;
}

export async function updateIntegrationAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.settings.manage");
  const id = uuid.parse(form.get("integration_id"));
  const parsed = integrationSettingsSchema.safeParse({
    display_name: form.get("display_name"),
    agent_name: form.get("agent_name"),
    fallback_message: form.get("fallback_message"),
    enabled: form.get("enabled") === "on",
    automation_enabled: form.get("automation_enabled") === "on",
  });
  if (!parsed.success) {
    done("error", parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const { error } = await supabase
    .from("whatsapp_integrations")
    .update({
      display_name: parsed.data.display_name || null,
      agent_name: parsed.data.agent_name,
      fallback_message: parsed.data.fallback_message,
      enabled: parsed.data.enabled,
      automation_enabled: parsed.data.automation_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) done("error", errorMessage(error));
  revalidatePath(RETURN_PATH);
  done("success", "Configuración guardada.");
}

export async function testConnectionAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.settings.manage");
  const id = uuid.parse(form.get("integration_id"));

  const { getWhatsAppProvider } = await import("@/modules/whatsapp/providers");
  const provider = getWhatsAppProvider();
  const result = await provider.checkConnection();

  await supabase
    .from("whatsapp_integrations")
    .update({
      connection_status: result.ok ? "ok" : "error",
      last_connection_check_at: new Date().toISOString(),
      last_connection_error: result.ok ? null : (result.error ?? "Error desconocido."),
    })
    .eq("id", id);

  revalidatePath(RETURN_PATH);
  if (result.ok) done("success", "Conexión verificada correctamente.");
  done("error", `No fue posible conectar: ${result.error ?? "error desconocido."}`);
}
