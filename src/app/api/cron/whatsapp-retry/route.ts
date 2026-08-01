import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/modules/whatsapp/providers";
import { AnthropicWhatsAppAgent } from "@/modules/whatsapp/agent/anthropic-agent";
import { NoopRateLimiter } from "@/modules/whatsapp/application/rate-limit";
import { respondToConversation } from "@/modules/whatsapp/application/inbound-service";
import { recordIntegrationEvent } from "@/modules/whatsapp/application/events";

export const runtime = "nodejs";
export const maxDuration = 60;

const STUCK_AFTER_MINUTES = 5;

function valid(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const value =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type StuckConversation = {
  id: string;
  company_id: string;
  business_unit_id: string;
  lead_id: string;
  integration_id: string;
  lead: { phone_e164: string } | { phone_e164: string }[] | null;
  integration: {
    phone_number_e164: string;
    agent_name: string;
    fallback_message: string;
    automation_enabled: boolean;
  } | {
    phone_number_e164: string;
    agent_name: string;
    fallback_message: string;
    automation_enabled: boolean;
  }[] | null;
};

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Red de seguridad: si `after()` en el webhook se corta antes de terminar
 * (cold start, timeout, deploy a mitad de proceso), la conversación queda
 * con ai_pending_since seteado y sin respuesta. Este cron reprocesa esas
 * conversaciones con el último mensaje del cliente. Mismo patrón de
 * autenticación por secreto que /api/cron/lodging-ical.
 */
export async function GET(request: Request) {
  if (!valid(request))
    return Response.json({ error: "No autorizado" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const threshold = new Date(
    Date.now() - STUCK_AFTER_MINUTES * 60_000,
  ).toISOString();

  const { data: stuck } = await admin
    .from("whatsapp_conversations")
    .select(
      "id,company_id,business_unit_id,lead_id,integration_id," +
        "lead:crm_leads!whatsapp_conversations_lead_id_fkey(phone_e164)," +
        "integration:whatsapp_integrations!whatsapp_conversations_integration_id_fkey(phone_number_e164,agent_name,fallback_message,automation_enabled)",
    )
    .eq("status", "ai_active")
    .not("ai_pending_since", "is", null)
    .lt("ai_pending_since", threshold)
    .limit(20);

  const conversations = (stuck ?? []) as unknown as StuckConversation[];
  const provider = getWhatsAppProvider();
  const agent = new AnthropicWhatsAppAgent();
  const rateLimiter = new NoopRateLimiter();

  let retried = 0;
  for (const conversation of conversations) {
    const lead = firstOf(conversation.lead);
    const integration = firstOf(conversation.integration);
    if (!lead?.phone_e164 || !integration?.phone_number_e164) continue;
    if (!integration.automation_enabled) continue;

    const { data: lastInbound } = await admin
      .from("whatsapp_messages")
      .select("id,content")
      .eq("conversation_id", conversation.id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastInbound) continue;

    try {
      await respondToConversation(
        { admin, provider, agent, rateLimiter },
        {
          conversationId: conversation.id,
          companyId: conversation.company_id,
          businessUnitId: conversation.business_unit_id,
          leadId: conversation.lead_id,
          integrationId: conversation.integration_id,
          toNumber: integration.phone_number_e164,
          fromNumber: lead.phone_e164,
          customerMessage: lastInbound.content ?? "(mensaje sin texto)",
          excludeMessageId: lastInbound.id,
          agentName: integration.agent_name,
          fallbackMessage: integration.fallback_message,
        },
      );
      retried++;
    } catch (error) {
      await recordIntegrationEvent(admin, {
        companyId: conversation.company_id,
        integrationId: conversation.integration_id,
        eventType: "ai_error",
        severity: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error inesperado en el reintento programado.",
        context: { conversation_id: conversation.id },
      });
    }
  }

  return Response.json({ ok: true, found: conversations.length, retried });
}
