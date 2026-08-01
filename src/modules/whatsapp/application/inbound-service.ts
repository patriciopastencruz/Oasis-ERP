import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NormalizedInboundMessage,
  WhatsAppProvider,
} from "@/modules/whatsapp/providers/whatsapp-provider";
import type { WhatsAppAgentProvider } from "@/modules/whatsapp/agent/agent-provider";
import { whatsappToolRegistry } from "@/modules/whatsapp/agent/tools/registry";
import type { WhatsAppToolContext } from "@/modules/whatsapp/agent/tools/types";
import { maskPhone } from "@/modules/whatsapp/domain/phone";
import { DEFAULT_RATE_LIMIT, type RateLimiter } from "./rate-limit";
import { recordIntegrationEvent } from "./events";

export type InboundServiceDeps = {
  admin: SupabaseClient;
  provider: WhatsAppProvider;
  agent: WhatsAppAgentProvider;
  rateLimiter: RateLimiter;
};

export type IngestStatus =
  | "ok"
  | "duplicate"
  | "unknown_number"
  | "disabled"
  | "opted_out"
  | "rate_limited"
  | "no_ai_needed"
  | "ai_error";

export type IngestResult = { status: IngestStatus };

type IngestRpcResult = {
  status: string;
  opted_out?: boolean;
  integration_id?: string;
  company_id?: string;
  business_unit_id?: string;
  lead_id?: string;
  conversation_id?: string;
  message_id?: string;
  conversation_status?: string;
  automation_enabled?: boolean;
  agent_name?: string;
  fallback_message?: string;
};

const DEFAULT_AI_MODEL =
  process.env.WHATSAPP_AI_MODEL ||
  process.env.ASSISTANT_AI_MODEL ||
  "claude-haiku-4-5-20251001";

/**
 * Orquestador principal: ingesta atómica (vía RPC) -> rate limit ->
 * delega en respondToConversation. Dependencias inyectadas para poder
 * testear sin red ni BD real. Nunca lanza -- cualquier fallo termina en
 * un IngestResult con status descriptivo, para que el route handler
 * siempre pueda responder 200 a Twilio.
 */
export async function handleInboundMessage(
  deps: InboundServiceDeps,
  message: NormalizedInboundMessage,
): Promise<IngestResult> {
  const { admin, rateLimiter } = deps;

  const { data: ingestData, error: ingestError } = await admin.rpc(
    "whatsapp_ingest_inbound_message",
    {
      payload: {
        provider: message.provider,
        to_number: message.toNumber,
        from_number: message.fromNumber,
        external_message_id: message.externalMessageId,
        message_type: message.messageType,
        content: message.content,
        profile_name: message.profileName,
        raw: message.raw,
      },
    },
  );

  if (ingestError) {
    await recordIntegrationEvent(admin, {
      eventType: "parse_error",
      severity: "error",
      message: ingestError.message,
      context: { external_message_id: message.externalMessageId },
    });
    return { status: "ai_error" };
  }

  const result = ingestData as IngestRpcResult;

  if (result.status === "unknown_number") {
    await recordIntegrationEvent(admin, {
      eventType: "unknown_number",
      severity: "warning",
      message: `Mensaje recibido para un número no configurado (${maskPhone(message.toNumber)}).`,
    });
    return { status: "unknown_number" };
  }
  if (result.status === "disabled") {
    await recordIntegrationEvent(admin, {
      integrationId: result.integration_id ?? null,
      eventType: "disabled",
      severity: "info",
      message: "Mensaje recibido en una integración deshabilitada.",
    });
    return { status: "disabled" };
  }
  if (result.status === "duplicate") {
    return { status: "duplicate" };
  }
  if (result.opted_out) {
    return { status: "opted_out" };
  }

  const conversationId = result.conversation_id;
  const companyId = result.company_id;
  const businessUnitId = result.business_unit_id;
  const leadId = result.lead_id;
  const integrationId = result.integration_id;
  if (!conversationId || !companyId || !businessUnitId || !leadId || !integrationId) {
    return { status: "ai_error" };
  }

  if (!result.automation_enabled || result.conversation_status !== "ai_active") {
    return { status: "no_ai_needed" };
  }

  const rateCheck = await rateLimiter.check({
    admin,
    conversationId,
    limit: DEFAULT_RATE_LIMIT.limit,
    windowSeconds: DEFAULT_RATE_LIMIT.windowSeconds,
  });
  if (rateCheck.limited) {
    await recordIntegrationEvent(admin, {
      companyId,
      integrationId,
      eventType: "rate_limited",
      severity: "warning",
      message: `Se superó el límite de mensajes en la conversación (${rateCheck.count} en la ventana).`,
      context: { conversation_id: conversationId },
    });
    return { status: "rate_limited" };
  }

  return respondToConversation(deps, {
    conversationId,
    companyId,
    businessUnitId,
    leadId,
    integrationId,
    toNumber: message.toNumber,
    fromNumber: message.fromNumber,
    customerMessage: message.content ?? "(mensaje sin texto)",
    excludeMessageId: result.message_id ?? null,
    agentName: result.agent_name || "Asistente Oasis",
    fallbackMessage:
      result.fallback_message ||
      "Gracias por tu mensaje. En breve un vendedor te va a responder.",
  });
}

export type RespondToConversationInput = {
  conversationId: string;
  companyId: string;
  businessUnitId: string;
  leadId: string;
  integrationId: string;
  toNumber: string;
  fromNumber: string;
  customerMessage: string;
  agentName: string;
  fallbackMessage: string;
  excludeMessageId?: string | null;
};

/**
 * Genera la respuesta del agente para una conversación ya resuelta y la
 * envía. Reutilizada tanto por el flujo normal del webhook como por el
 * cron de reintento (/api/cron/whatsapp-retry) cuando `after()` se corta
 * antes de completar -- no depende de un mensaje recién insertado, solo
 * de los IDs ya resueltos.
 */
export async function respondToConversation(
  deps: InboundServiceDeps,
  input: RespondToConversationInput,
): Promise<IngestResult> {
  const { admin, provider, agent } = deps;
  const {
    conversationId,
    companyId,
    businessUnitId,
    leadId,
    integrationId,
    toNumber,
    fromNumber,
    customerMessage,
    agentName,
    fallbackMessage,
    excludeMessageId,
  } = input;

  const [{ data: lead }, { data: recentMessages }] = await Promise.all([
    admin
      .from("crm_leads")
      .select(
        "full_name,city,product_interest,bedrooms,bathrooms,surface_m2,budget_clp",
      )
      .eq("id", leadId)
      .maybeSingle(),
    admin
      .from("whatsapp_messages")
      .select("direction,sender_type,content")
      .eq("conversation_id", conversationId)
      .neq("id", excludeMessageId ?? "")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const history = (recentMessages ?? [])
    .filter(
      (m): m is { direction: string; sender_type: string; content: string } =>
        Boolean(m.content) && m.sender_type !== "system",
    )
    .reverse()
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const toolContext: WhatsAppToolContext = {
    admin,
    companyId,
    businessUnitId,
    integrationId,
    leadId,
    conversationId,
  };

  let output;
  try {
    output = await agent.generateReply(
      {
        agentName,
        customerMessage,
        lead: {
          fullName: lead?.full_name ?? null,
          city: lead?.city ?? null,
          productInterest: lead?.product_interest ?? null,
          bedrooms: lead?.bedrooms ?? null,
          bathrooms: lead?.bathrooms ?? null,
          surfaceM2: lead?.surface_m2 ?? null,
          budgetClp: lead?.budget_clp ?? null,
          phoneE164: fromNumber,
        },
        history,
      },
      whatsappToolRegistry,
      toolContext,
    );
  } catch (error) {
    await recordIntegrationEvent(admin, {
      companyId,
      integrationId,
      eventType: "ai_error",
      severity: "error",
      message:
        error instanceof Error
          ? error.message
          : "Error desconocido del agente de IA.",
      context: { conversation_id: conversationId },
    });
    await sendSafeFallback(
      admin,
      provider,
      toNumber,
      fromNumber,
      conversationId,
      fallbackMessage,
    );
    await admin.rpc("whatsapp_escalate_to_human", {
      target_conversation: conversationId,
      reason: "Fallo del proveedor de IA",
    });
    return { status: "ai_error" };
  }

  const updates = Object.fromEntries(
    Object.entries(output.leadUpdates).filter(([, value]) => value !== null),
  );
  if (Object.keys(updates).length > 0) {
    await admin
      .from("crm_leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("company_id", companyId);
  }

  try {
    const sent = await provider.sendTextMessage({
      to: fromNumber,
      from: toNumber,
      body: output.reply,
    });
    await admin.rpc("whatsapp_record_agent_message", {
      payload: {
        conversation_id: conversationId,
        content: output.reply,
        sender_type: "ai",
        external_message_id: sent.externalMessageId,
        ai_model: DEFAULT_AI_MODEL,
        ai_intent: output.intent,
        delivery_status: "sent",
      },
    });
  } catch (error) {
    await recordIntegrationEvent(admin, {
      companyId,
      integrationId,
      eventType: "provider_error",
      severity: "error",
      message:
        error instanceof Error
          ? error.message
          : "Error al enviar el mensaje por WhatsApp.",
      context: { conversation_id: conversationId },
    });
    await admin.rpc("whatsapp_record_agent_message", {
      payload: {
        conversation_id: conversationId,
        content: output.reply,
        sender_type: "ai",
        ai_model: DEFAULT_AI_MODEL,
        ai_intent: output.intent,
        delivery_status: "failed",
      },
    });
  }

  if (output.requiresHuman) {
    await admin.rpc("whatsapp_escalate_to_human", {
      target_conversation: conversationId,
      reason:
        output.reason ||
        "El agente detectó intención de compra o necesidad de un vendedor.",
    });
  }

  return { status: "ok" };
}

async function sendSafeFallback(
  admin: SupabaseClient,
  provider: WhatsAppProvider,
  toNumber: string,
  fromNumber: string,
  conversationId: string,
  fallbackMessage: string,
): Promise<void> {
  try {
    const sent = await provider.sendTextMessage({
      to: fromNumber,
      from: toNumber,
      body: fallbackMessage,
    });
    await admin.rpc("whatsapp_record_agent_message", {
      payload: {
        conversation_id: conversationId,
        content: fallbackMessage,
        sender_type: "system",
        external_message_id: sent.externalMessageId,
        delivery_status: "sent",
      },
    });
  } catch {
    // Si tampoco se pudo enviar el fallback, el evento ai_error ya
    // registrado arriba es suficiente para que el equipo lo note.
  }
}
