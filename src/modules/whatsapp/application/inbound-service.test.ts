import { describe, expect, it, vi } from "vitest";
import { handleInboundMessage } from "./inbound-service";
import type { NormalizedInboundMessage } from "@/modules/whatsapp/providers/whatsapp-provider";
import type { WhatsAppProvider } from "@/modules/whatsapp/providers/whatsapp-provider";
import type { WhatsAppAgentProvider } from "@/modules/whatsapp/agent/agent-provider";
import type { WhatsAppAgentOutput } from "@/modules/whatsapp/agent/output-schema";
import type { RateLimiter } from "./rate-limit";

type FakeResult = { data?: unknown; error?: { message: string } | null };

function createFakeAdmin(options: {
  rpc?: Record<string, FakeResult>;
  tables?: Record<string, FakeResult>;
}) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const tableCalls: { table: string; method: string; args: unknown[] }[] = [];

  function chain(table: string) {
    const response = options.tables?.[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "update",
      "eq",
      "neq",
      "order",
      "limit",
      "gte",
      "is",
    ]) {
      builder[method] = (...args: unknown[]) => {
        tableCalls.push({ table, method, args });
        return builder;
      };
    }
    builder.maybeSingle = async () => response;
    builder.single = async () => response;
    builder.then = (resolve: (value: FakeResult) => unknown) =>
      resolve(response);
    return builder;
  }

  return {
    from: (table: string) => chain(table),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return options.rpc?.[name] ?? { data: null, error: null };
    },
    rpcCalls,
    tableCalls,
  };
}

const inboundMessage: NormalizedInboundMessage = {
  provider: "twilio",
  toNumber: "+14155238886",
  fromNumber: "+56912345678",
  externalMessageId: "SM_IN_1",
  messageType: "text",
  content: "Hola, quiero cotizar una casa",
  profileName: "Juan Pérez",
  raw: {},
};

const okIngestResult = {
  status: "ok",
  opted_out: false,
  integration_id: "integration-1",
  company_id: "company-1",
  business_unit_id: "unit-1",
  lead_id: "lead-1",
  conversation_id: "conversation-1",
  message_id: "message-in-1",
  conversation_status: "ai_active",
  automation_enabled: true,
  agent_name: "Asistente Oasis",
  fallback_message: "Gracias por tu mensaje, en breve un vendedor te responde.",
};

function fakeProvider(overrides: Partial<WhatsAppProvider> = {}): WhatsAppProvider {
  return {
    name: "twilio",
    isConfigured: () => true,
    normalizePhoneNumber: (v: string) => v,
    verifyWebhookSignature: () => true,
    parseWebhook: () => null,
    sendTextMessage: vi.fn().mockResolvedValue({ externalMessageId: "SM_OUT_1" }),
    sendTemplateMessage: vi.fn().mockResolvedValue({ externalMessageId: "SM_OUT_1" }),
    checkConnection: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

const validAgentOutput: WhatsAppAgentOutput = {
  reply: "Hola Juan, ¿en qué ciudad necesitas el módulo?",
  intent: "qualification",
  leadUpdates: {
    full_name: "Juan Pérez",
    city: null,
    product_interest: null,
    bedrooms: null,
    bathrooms: null,
    surface_m2: null,
    budget_clp: null,
  },
  requiresHuman: false,
  reason: null,
};

const noopRateLimiter: RateLimiter = {
  check: vi.fn().mockResolvedValue({ limited: false, count: 1 }),
};

describe("handleInboundMessage — flujo normal", () => {
  it("procesa un mensaje nuevo: llama al agente, envía la respuesta y aplica leadUpdates", async () => {
    const admin = createFakeAdmin({
      rpc: { whatsapp_ingest_inbound_message: { data: okIngestResult, error: null } },
    });
    const provider = fakeProvider();
    const generateReply = vi.fn().mockResolvedValue(validAgentOutput);
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider, agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("ok");
    expect(provider.sendTextMessage).toHaveBeenCalledWith({
      to: "+56912345678",
      from: "+14155238886",
      body: validAgentOutput.reply,
    });
    expect(
      admin.rpcCalls.some((c) => c.name === "whatsapp_record_agent_message"),
    ).toBe(true);
    const leadUpdateCall = admin.tableCalls.find(
      (c) => c.table === "crm_leads" && c.method === "update",
    );
    expect(leadUpdateCall?.args[0]).toMatchObject({ full_name: "Juan Pérez" });
  });

  it("pasa al agente el company_id/business_unit_id que devolvió la función de ingesta, no un valor externo", async () => {
    const admin = createFakeAdmin({
      rpc: { whatsapp_ingest_inbound_message: { data: okIngestResult, error: null } },
    });
    const generateReply = vi.fn().mockResolvedValue(validAgentOutput);
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    await handleInboundMessage(
      { admin: admin as never, provider: fakeProvider(), agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    const [, , toolContext] = generateReply.mock.calls[0];
    expect(toolContext).toMatchObject({
      companyId: "company-1",
      businessUnitId: "unit-1",
      leadId: "lead-1",
      conversationId: "conversation-1",
    });
  });
});

describe("handleInboundMessage — idempotencia y bordes", () => {
  it("no invoca al agente ni envía nada si el mensaje es duplicado", async () => {
    const admin = createFakeAdmin({
      rpc: {
        whatsapp_ingest_inbound_message: {
          data: { status: "duplicate", conversation_id: "conversation-1" },
          error: null,
        },
      },
    });
    const provider = fakeProvider();
    const generateReply = vi.fn();
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider, agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("duplicate");
    expect(generateReply).not.toHaveBeenCalled();
    expect(provider.sendTextMessage).not.toHaveBeenCalled();
  });

  it("registra un evento y no llama al agente si el número receptor es desconocido", async () => {
    const admin = createFakeAdmin({
      rpc: {
        whatsapp_ingest_inbound_message: { data: { status: "unknown_number" }, error: null },
      },
    });
    const generateReply = vi.fn();
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider: fakeProvider(), agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("unknown_number");
    expect(generateReply).not.toHaveBeenCalled();
    expect(
      admin.rpcCalls.some((c) => c.name === "whatsapp_record_integration_event"),
    ).toBe(true);
  });

  it("no llama al agente si la automatización está apagada para la integración", async () => {
    const admin = createFakeAdmin({
      rpc: {
        whatsapp_ingest_inbound_message: {
          data: { ...okIngestResult, automation_enabled: false },
          error: null,
        },
      },
    });
    const generateReply = vi.fn();
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider: fakeProvider(), agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("no_ai_needed");
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("no envía nada si opted_out es true (baja/STOP)", async () => {
    const admin = createFakeAdmin({
      rpc: {
        whatsapp_ingest_inbound_message: {
          data: { ...okIngestResult, opted_out: true },
          error: null,
        },
      },
    });
    const provider = fakeProvider();
    const generateReply = vi.fn();
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider, agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("opted_out");
    expect(generateReply).not.toHaveBeenCalled();
    expect(provider.sendTextMessage).not.toHaveBeenCalled();
  });
});

describe("handleInboundMessage — fallos del agente y del proveedor", () => {
  it("ante un error del agente de IA, envía el mensaje de fallback y escala a humano en vez de fallar silenciosamente", async () => {
    const admin = createFakeAdmin({
      rpc: { whatsapp_ingest_inbound_message: { data: okIngestResult, error: null } },
    });
    const provider = fakeProvider();
    const generateReply = vi.fn().mockRejectedValue(new Error("Timeout del modelo"));
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider, agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("ai_error");
    expect(provider.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: okIngestResult.fallback_message }),
    );
    expect(
      admin.rpcCalls.some((c) => c.name === "whatsapp_escalate_to_human"),
    ).toBe(true);
    expect(
      admin.rpcCalls.some((c) => c.name === "whatsapp_record_integration_event"),
    ).toBe(true);
  });

  it("si falla el envío por WhatsApp, registra el mensaje como fallido pero no rompe el flujo", async () => {
    const admin = createFakeAdmin({
      rpc: { whatsapp_ingest_inbound_message: { data: okIngestResult, error: null } },
    });
    const provider = fakeProvider({
      sendTextMessage: vi.fn().mockRejectedValue(new Error("Twilio caído")),
    });
    const generateReply = vi.fn().mockResolvedValue(validAgentOutput);
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    const result = await handleInboundMessage(
      { admin: admin as never, provider, agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("ok");
    const recordCall = admin.rpcCalls.find(
      (c) => c.name === "whatsapp_record_agent_message",
    );
    expect(
      (recordCall?.args as { payload: { delivery_status: string } }).payload
        .delivery_status,
    ).toBe("failed");
    expect(
      admin.rpcCalls.some((c) => c.name === "whatsapp_record_integration_event"),
    ).toBe(true);
  });

  it("escala a humano cuando el agente marca requiresHuman en true", async () => {
    const admin = createFakeAdmin({
      rpc: { whatsapp_ingest_inbound_message: { data: okIngestResult, error: null } },
    });
    const generateReply = vi.fn().mockResolvedValue({
      ...validAgentOutput,
      requiresHuman: true,
      reason: "Quiere agendar una visita",
    });
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };

    await handleInboundMessage(
      { admin: admin as never, provider: fakeProvider(), agent, rateLimiter: noopRateLimiter },
      inboundMessage,
    );

    const escalateCall = admin.rpcCalls.find(
      (c) => c.name === "whatsapp_escalate_to_human",
    );
    expect(escalateCall?.args).toEqual({
      target_conversation: "conversation-1",
      reason: "Quiere agendar una visita",
    });
  });
});

describe("handleInboundMessage — límite de mensajes", () => {
  it("no llama al agente si se supera el límite de la ventana", async () => {
    const admin = createFakeAdmin({
      rpc: { whatsapp_ingest_inbound_message: { data: okIngestResult, error: null } },
    });
    const generateReply = vi.fn();
    const agent: WhatsAppAgentProvider = { isConfigured: () => true, generateReply };
    const rateLimiter: RateLimiter = {
      check: vi.fn().mockResolvedValue({ limited: true, count: 30 }),
    };

    const result = await handleInboundMessage(
      { admin: admin as never, provider: fakeProvider(), agent, rateLimiter },
      inboundMessage,
    );

    expect(result.status).toBe("rate_limited");
    expect(generateReply).not.toHaveBeenCalled();
  });
});
