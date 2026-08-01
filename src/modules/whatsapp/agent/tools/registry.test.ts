import { describe, expect, it } from "vitest";
import { whatsappToolRegistry } from "./registry";
import type { WhatsAppToolContext } from "./types";

type FakeResult = { data?: unknown; error?: { message: string } | null };

function createFakeAdmin(
  tableResponses: Record<string, FakeResult> = {},
  rpcResponses: Record<string, FakeResult> = {},
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  function chainFor(table: string) {
    const result = tableResponses[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        calls.push({ table, method: "select", args });
        return chain;
      },
      insert: (...args: unknown[]) => {
        calls.push({ table, method: "insert", args });
        return chain;
      },
      update: (...args: unknown[]) => {
        calls.push({ table, method: "update", args });
        return chain;
      },
      eq: (...args: unknown[]) => {
        calls.push({ table, method: "eq", args });
        return chain;
      },
      neq: (...args: unknown[]) => {
        calls.push({ table, method: "neq", args });
        return chain;
      },
      is: (...args: unknown[]) => {
        calls.push({ table, method: "is", args });
        return chain;
      },
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve: (value: FakeResult) => unknown) => resolve(result),
    };
    return chain;
  }

  const admin = {
    from: (table: string) => chainFor(table),
    rpc: async (name: string, args: unknown) => {
      calls.push({ table: "__rpc__", method: name, args: [args] });
      return rpcResponses[name] ?? { data: null, error: null };
    },
    calls,
  };
  return admin;
}

function findTool(name: string) {
  const tool = whatsappToolRegistry.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} no encontrada en el registry`);
  return tool;
}

function baseContext(
  admin: ReturnType<typeof createFakeAdmin>,
): WhatsAppToolContext {
  return {
    // el fake admin implementa el mismo subconjunto usado por las tools
    admin: admin as unknown as WhatsAppToolContext["admin"],
    companyId: "company-1",
    businessUnitId: "unit-1",
    integrationId: "integration-1",
    leadId: "lead-1",
    conversationId: "conversation-1",
  };
}

describe("company_id siempre viene del contexto, nunca del modelo", () => {
  it("crearLead inserta con el company_id/business_unit_id del contexto, aunque no vengan en el input", async () => {
    const admin = createFakeAdmin({
      crm_leads: { data: { id: "new-lead" }, error: null },
    });
    const context = baseContext(admin);
    const result = await findTool("crearLead").execute(
      { phone: "+56911112222", full_name: "Ana" },
      context,
    );
    expect(result).toEqual({ lead_id: "new-lead" });
    const insertCall = admin.calls.find(
      (c) => c.table === "crm_leads" && c.method === "insert",
    );
    expect(insertCall?.args[0]).toMatchObject({
      company_id: "company-1",
      business_unit_id: "unit-1",
      phone_e164: "+56911112222",
    });
  });

  it("registrarInteres actualiza solo el lead_id del contexto, filtrando por company_id", async () => {
    const admin = createFakeAdmin({
      crm_leads: { data: { status: "new", source_notes: null }, error: null },
    });
    const context = baseContext(admin);
    await findTool("registrarInteres").execute(
      { note: "Quiere una casa de 3 dormitorios" },
      context,
    );
    const updateCall = admin.calls.find(
      (c) => c.table === "crm_leads" && c.method === "update",
    );
    const eqCalls = admin.calls.filter(
      (c) => c.table === "crm_leads" && c.method === "eq",
    );
    expect(updateCall?.args[0]).toMatchObject({ status: "qualifying" });
    expect(eqCalls.some((c) => c.args[0] === "id" && c.args[1] === "lead-1")).toBe(
      true,
    );
    expect(
      eqCalls.some((c) => c.args[0] === "company_id" && c.args[1] === "company-1"),
    ).toBe(true);
  });
});

describe("validación de input con Zod", () => {
  it("actualizarLead rechaza una fecha estimada mal formada", async () => {
    const admin = createFakeAdmin();
    const context = baseContext(admin);
    await expect(
      findTool("actualizarLead").execute(
        { estimated_date: "no-es-una-fecha" },
        context,
      ),
    ).rejects.toThrow();
  });

  it("crearLead rechaza un teléfono inválido", async () => {
    const admin = createFakeAdmin();
    const context = baseContext(admin);
    await expect(
      findTool("crearLead").execute({ phone: "abc" }, context),
    ).rejects.toThrow();
  });
});

describe("fallback seguro de precios (sin tarifario automatizado)", () => {
  it("consultarPrecioAutorizado siempre responde disponible:false", async () => {
    const admin = createFakeAdmin();
    const context = baseContext(admin);
    const result = await findTool("consultarPrecioAutorizado").execute(
      {},
      context,
    );
    expect(result).toMatchObject({ disponible: false });
  });
});

describe("derivarAVendedor", () => {
  it("invoca whatsapp_escalate_to_human con el conversation_id del contexto y el motivo", async () => {
    const admin = createFakeAdmin(
      {},
      { whatsapp_escalate_to_human: { data: null, error: null } },
    );
    const context = baseContext(admin);
    const result = await findTool("derivarAVendedor").execute(
      { reason: "El cliente quiere negociar el precio" },
      context,
    );
    expect(result).toEqual({ derivado: true });
    const rpcCall = admin.calls.find(
      (c) => c.table === "__rpc__" && c.method === "whatsapp_escalate_to_human",
    );
    expect(rpcCall?.args[0]).toEqual({
      target_conversation: "conversation-1",
      reason: "El cliente quiere negociar el precio",
    });
  });
});

describe("guardarMensaje", () => {
  it("guarda una nota interna sender_type=system, no un mensaje saliente al cliente", async () => {
    const admin = createFakeAdmin({
      whatsapp_conversations: { data: { provider: "twilio" }, error: null },
      whatsapp_messages: { data: null, error: null },
    });
    const context = baseContext(admin);
    await findTool("guardarMensaje").execute(
      { note: "Cliente parece muy interesado, seguir de cerca" },
      context,
    );
    const insertCall = admin.calls.find(
      (c) => c.table === "whatsapp_messages" && c.method === "insert",
    );
    expect(insertCall?.args[0]).toMatchObject({
      sender_type: "system",
      conversation_id: "conversation-1",
      company_id: "company-1",
    });
  });
});
