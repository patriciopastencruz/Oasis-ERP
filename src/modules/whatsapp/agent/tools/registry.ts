import { z } from "zod";
import { normalizePhoneNumber } from "@/modules/whatsapp/domain/phone";
import type { WhatsAppTool, WhatsAppToolContext } from "./types";

const phoneSchema = z.object({ phone: z.string().trim().min(6).max(20) });

async function searchKnowledgeArticles(
  context: WhatsAppToolContext,
  query: string,
) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const { data } = await context.admin
    .from("assistant_knowledge_articles")
    .select("id,title,content,keywords")
    .eq("company_id", context.companyId)
    .eq("module_key", "whatsapp_comercial")
    .eq("validation_status", "verified")
    .eq("active", true);
  const articles = (data ?? []) as {
    id: string;
    title: string;
    content: string;
    keywords: string[];
  }[];
  const scored = articles
    .map((article) => {
      const haystack = `${article.title} ${article.content} ${(article.keywords ?? []).join(" ")}`.toLowerCase();
      const score = terms.filter((t) => haystack.includes(t)).length;
      return { article, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (scored.length === 0) {
    return {
      encontrado: false,
      resultados: [] as { titulo: string; contenido: string }[],
    };
  }
  return {
    encontrado: true,
    resultados: scored.map(({ article }) => ({
      titulo: article.title,
      contenido: article.content,
    })),
  };
}

const buscarLeadPorTelefono: WhatsAppTool<{ phone: string }> = {
  name: "buscarLeadPorTelefono",
  description:
    "Busca un lead existente por teléfono dentro de la misma empresa (útil si el cliente menciona el número de otra persona).",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: { phone: { type: "string", description: "Teléfono a buscar." } },
    required: ["phone"],
  },
  async execute(input, context) {
    const { phone } = phoneSchema.parse(input);
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return { encontrado: false };
    const { data } = await context.admin
      .from("crm_leads")
      .select("id,full_name,city,status")
      .eq("company_id", context.companyId)
      .eq("phone_e164", normalized)
      .is("deleted_at", null)
      .maybeSingle();
    return data ? { encontrado: true, lead: data } : { encontrado: false };
  },
};

const crearLeadSchema = z.object({
  phone: z.string().trim().min(6).max(20),
  full_name: z.string().trim().min(1).max(160).optional(),
});
const crearLead: WhatsAppTool<z.infer<typeof crearLeadSchema>> = {
  name: "crearLead",
  description:
    "Crea un lead nuevo para un teléfono distinto al de esta conversación (por ejemplo, un tercero que el cliente menciona).",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      phone: { type: "string" },
      full_name: { type: "string" },
    },
    required: ["phone"],
  },
  async execute(input, context) {
    const parsed = crearLeadSchema.parse(input);
    const normalized = normalizePhoneNumber(parsed.phone);
    if (!normalized) throw new Error("Teléfono inválido.");
    const { data, error } = await context.admin
      .from("crm_leads")
      .insert({
        company_id: context.companyId,
        business_unit_id: context.businessUnitId,
        phone_e164: normalized,
        full_name: parsed.full_name ?? null,
        channel: "whatsapp",
        created_via: "agent",
        last_interaction_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { lead_id: data.id };
  },
};

const actualizarLeadSchema = z.object({
  requires_transport: z.boolean().optional(),
  requires_installation: z.boolean().optional(),
  estimated_date: z.string().date().optional(),
  source_notes: z.string().trim().max(500).optional(),
});
const actualizarLead: WhatsAppTool<z.infer<typeof actualizarLeadSchema>> = {
  name: "actualizarLead",
  description:
    "Actualiza datos secundarios del lead de esta conversación que no van en la respuesta final (transporte, instalación, fecha estimada, notas). Para nombre/ciudad/producto/dormitorios/baños/superficie/presupuesto usa el campo leadUpdates de tu respuesta final, no esta herramienta.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      requires_transport: { type: "boolean" },
      requires_installation: { type: "boolean" },
      estimated_date: { type: "string", description: "Fecha ISO (YYYY-MM-DD)." },
      source_notes: { type: "string" },
    },
  },
  async execute(input, context) {
    const parsed = actualizarLeadSchema.parse(input);
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.requires_transport !== undefined) update.requires_transport = parsed.requires_transport;
    if (parsed.requires_installation !== undefined) update.requires_installation = parsed.requires_installation;
    if (parsed.estimated_date) update.estimated_date = parsed.estimated_date;
    if (parsed.source_notes) update.source_notes = parsed.source_notes;
    const { error } = await context.admin
      .from("crm_leads")
      .update(update)
      .eq("id", context.leadId)
      .eq("company_id", context.companyId);
    if (error) throw new Error(error.message);
    return { actualizado: true };
  },
};

const obtenerConversacion: WhatsAppTool<Record<string, never>> = {
  name: "obtenerConversacion",
  description: "Obtiene el estado actual de esta conversación (status, si requiere humano, cantidad de mensajes).",
  mode: "read",
  inputSchema: { type: "object", properties: {} },
  async execute(_input, context) {
    const { data } = await context.admin
      .from("whatsapp_conversations")
      .select("status,requires_human,message_count,last_message_at")
      .eq("id", context.conversationId)
      .maybeSingle();
    return data ?? { encontrado: false };
  },
};

const guardarMensajeSchema = z.object({ note: z.string().trim().min(1).max(500) });
const guardarMensaje: WhatsAppTool<z.infer<typeof guardarMensajeSchema>> = {
  name: "guardarMensaje",
  description:
    "Guarda una nota interna visible solo en el ERP para el equipo comercial. NO se envía al cliente por WhatsApp — para responderle al cliente usa el campo reply de tu respuesta final.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: { note: { type: "string" } },
    required: ["note"],
  },
  async execute(input, context) {
    const parsed = guardarMensajeSchema.parse(input);
    const { data: conversation } = await context.admin
      .from("whatsapp_conversations")
      .select("provider")
      .eq("id", context.conversationId)
      .maybeSingle();
    const { error } = await context.admin.from("whatsapp_messages").insert({
      company_id: context.companyId,
      business_unit_id: context.businessUnitId,
      conversation_id: context.conversationId,
      provider: conversation?.provider ?? "twilio",
      direction: "outbound",
      sender_type: "system",
      message_type: "text",
      content: parsed.note,
      delivery_status: "sent",
    });
    if (error) throw new Error(error.message);
    return { guardado: true };
  },
};

const querySchema = z.object({ query: z.string().trim().min(2).max(200) });

const consultarInformacionComercial: WhatsAppTool<z.infer<typeof querySchema>> = {
  name: "consultarInformacionComercial",
  description:
    "Busca información comercial general verificada de Oasis Modulares (qué hace la empresa, zonas de atención, proceso general) por palabras clave.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  async execute(input, context) {
    const { query } = querySchema.parse(input);
    return searchKnowledgeArticles(context, query);
  },
};

const consultarModelo: WhatsAppTool<z.infer<typeof querySchema>> = {
  name: "consultarModelo",
  description:
    "Busca especificaciones verificadas de un modelo o tipo de módulo específico (casa, oficina, baño) por palabras clave.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  async execute(input, context) {
    const { query } = querySchema.parse(input);
    return searchKnowledgeArticles(context, query);
  },
};

const consultarPrecioAutorizado: WhatsAppTool<Record<string, never>> = {
  name: "consultarPrecioAutorizado",
  description:
    "Consulta si existe un precio autorizado para responder directamente al cliente. El ERP aún no tiene un tarifario automatizado: siempre debes derivar a un vendedor para precios exactos.",
  mode: "read",
  inputSchema: { type: "object", properties: {} },
  async execute() {
    return {
      disponible: false,
      motivo: "sin_tarifario_automatizado",
      mensaje:
        "No hay un tarifario automatizado disponible; un vendedor debe confirmar el precio exacto.",
    };
  },
};

const registrarInteresSchema = z.object({ note: z.string().trim().min(1).max(500) });
const registrarInteres: WhatsAppTool<z.infer<typeof registrarInteresSchema>> = {
  name: "registrarInteres",
  description: "Registra que el cliente mostró interés concreto, avanzando su estado comercial a 'calificando'.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: { note: { type: "string" } },
    required: ["note"],
  },
  async execute(input, context) {
    const parsed = registrarInteresSchema.parse(input);
    const { data: lead } = await context.admin
      .from("crm_leads")
      .select("status,source_notes")
      .eq("id", context.leadId)
      .maybeSingle();
    const nextStatus =
      lead && (lead.status === "new" || lead.status === "contacted")
        ? "qualifying"
        : lead?.status;
    const combinedNotes = [lead?.source_notes, parsed.note].filter(Boolean).join(" | ").slice(0, 2000);
    const { error } = await context.admin
      .from("crm_leads")
      .update({ status: nextStatus, source_notes: combinedNotes, updated_at: new Date().toISOString() })
      .eq("id", context.leadId)
      .eq("company_id", context.companyId);
    if (error) throw new Error(error.message);
    return { registrado: true };
  },
};

const solicitarCotizacion: WhatsAppTool<Record<string, never>> = {
  name: "solicitarCotizacion",
  description: "Marca al lead como interesado en recibir una cotización formal, para que un vendedor la genere en el ERP.",
  mode: "write",
  inputSchema: { type: "object", properties: {} },
  async execute(_input, context) {
    const { error } = await context.admin
      .from("crm_leads")
      .update({ status: "quotation_requested", updated_at: new Date().toISOString() })
      .eq("id", context.leadId)
      .eq("company_id", context.companyId);
    if (error) throw new Error(error.message);
    return { solicitado: true };
  },
};

const derivarAVendedorSchema = z.object({ reason: z.string().trim().min(1).max(300) });
const derivarAVendedor: WhatsAppTool<z.infer<typeof derivarAVendedorSchema>> = {
  name: "derivarAVendedor",
  description:
    "Deriva la conversación a un vendedor humano (queja, negociación, solicitud explícita, caso complejo o intención real de compra).",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: { reason: { type: "string" } },
    required: ["reason"],
  },
  async execute(input, context) {
    const parsed = derivarAVendedorSchema.parse(input);
    const { error } = await context.admin.rpc("whatsapp_escalate_to_human", {
      target_conversation: context.conversationId,
      reason: parsed.reason,
    });
    if (error) throw new Error(error.message);
    return { derivado: true };
  },
};

const pausarAgenteSchema = z.object({ reason: z.string().trim().min(1).max(300) });
const pausarAgente: WhatsAppTool<z.infer<typeof pausarAgenteSchema>> = {
  name: "pausarAgente",
  description: "Pausa la automatización de esta conversación sin marcarla como que requiere un vendedor de inmediato.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: { reason: { type: "string" } },
    required: ["reason"],
  },
  async execute(input, context) {
    const parsed = pausarAgenteSchema.parse(input);
    const { error } = await context.admin
      .from("whatsapp_conversations")
      .update({
        status: "paused",
        ai_paused_reason: parsed.reason,
        ai_pending_since: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.conversationId)
      .eq("company_id", context.companyId)
      .neq("status", "closed");
    if (error) throw new Error(error.message);
    return { pausado: true };
  },
};

const generarResumenConversacion: WhatsAppTool<Record<string, never>> = {
  name: "generarResumenConversacion",
  description: "Genera un resumen breve y determinístico del lead y la conversación, útil para un vendedor que recién la toma.",
  mode: "read",
  inputSchema: { type: "object", properties: {} },
  async execute(_input, context) {
    const [{ data: lead }, { data: conversation }] = await Promise.all([
      context.admin
        .from("crm_leads")
        .select("full_name,city,product_interest,bedrooms,bathrooms,surface_m2,budget_clp,status")
        .eq("id", context.leadId)
        .maybeSingle(),
      context.admin
        .from("whatsapp_conversations")
        .select("status,message_count,last_message_at")
        .eq("id", context.conversationId)
        .maybeSingle(),
    ]);
    return { lead: lead ?? null, conversacion: conversation ?? null };
  },
};

export const whatsappToolRegistry: WhatsAppTool[] = [
  buscarLeadPorTelefono,
  crearLead,
  actualizarLead,
  obtenerConversacion,
  guardarMensaje,
  consultarInformacionComercial,
  consultarModelo,
  consultarPrecioAutorizado,
  registrarInteres,
  solicitarCotizacion,
  derivarAVendedor,
  pausarAgente,
  generarResumenConversacion,
];
