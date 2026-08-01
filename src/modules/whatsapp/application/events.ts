import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IntegrationEventType =
  | "invalid_signature"
  | "unknown_number"
  | "disabled"
  | "parse_error"
  | "duplicate_message"
  | "rate_limited"
  | "provider_error"
  | "ai_error"
  | "ai_invalid_output"
  | "opt_out"
  | "manual_test";

export type RecordIntegrationEventInput = {
  companyId?: string | null;
  integrationId?: string | null;
  eventType: IntegrationEventType;
  severity?: "info" | "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
};

/**
 * Registra un evento técnico del webhook. Si no se pudo resolver
 * company_id (firma inválida, número desconocido) el evento igual queda
 * visible al equipo vía audit_logs (patrón manual de
 * platform/admin/application/actions.ts) porque whatsapp_integration_events
 * exige can_access_company(company_id) para leerse.
 */
export async function recordIntegrationEvent(
  admin: SupabaseClient,
  input: RecordIntegrationEventInput,
): Promise<void> {
  await admin.rpc("whatsapp_record_integration_event", {
    payload: {
      company_id: input.companyId ?? null,
      integration_id: input.integrationId ?? null,
      event_type: input.eventType,
      severity: input.severity ?? "info",
      message: input.message,
      context: input.context ?? {},
    },
  });
  if (!input.companyId) {
    await admin.from("audit_logs").insert({
      actor_id: null,
      action: "whatsapp_webhook_event",
      entity_type: "whatsapp_integration_event",
      entity_id: null,
      new_data: { event_type: input.eventType, message: input.message },
      company_id: null,
    });
  }
}
