import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatTurns, currentInquiryCustomerText, type LuciaHistoryMessage } from "@/modules/lucia/domain/history";
import { usageCostUsd } from "@/modules/lucia/domain/pricing";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { buildDistContextNote, buildDistKnowledge, type DistCustomerContext, type DistProductContext, type DistRecentOrder } from "../domain/prompt";
import { DistBrainError, generateDistReply } from "./brain";

export type DistProcessResult =
  | { status: "replied"; messageId: string; ordered: boolean }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

const STATUS_LABEL: Record<string, string> = {
  draft: "borrador",
  scheduled: "programado",
  assigned: "asignado",
  en_route: "en camino",
  delivered: "entregado",
  partially_delivered: "entrega parcial",
  not_delivered: "no entregado",
  rescheduled: "reprogramado",
  cancelled: "cancelado",
};

function todayInChile() {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
}

/**
 * Genera y guarda la respuesta del asistente a la última consulta del cliente.
 * Recibe el cliente de servicio porque lo llama el worker (sin sesión) y el simulador
 * después de validar permisos con la sesión del usuario.
 */
export async function processDistConversation(admin: SupabaseClient, conversationId: string): Promise<DistProcessResult> {
  const { data: conversation } = await admin
    .from("dist_wa_conversations")
    .select("id,company_id,business_unit_id,channel,status,paused_until,contact_phone,contact_name,customer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { status: "skipped", reason: "not_found" };
  if (conversation.status !== "assistant") return { status: "skipped", reason: conversation.status };
  if (conversation.paused_until && new Date(conversation.paused_until) > new Date()) return { status: "skipped", reason: "paused" };

  const simulate = conversation.channel === "simulator";
  const { data: settings } = await admin
    .from("dist_wa_settings")
    .select("enabled,agent_name,general_instructions,model,history_messages,daily_budget_usd,same_day_cutoff,delivery_weekdays")
    .eq("business_unit_id", conversation.business_unit_id)
    .maybeSingle();
  if (!settings) return { status: "skipped", reason: "not_configured" };
  if (!settings.enabled && !simulate) return { status: "skipped", reason: "disabled" };

  const unitId = conversation.business_unit_id as string;
  const log = (severity: "info" | "warning" | "error", type: string, message: string) =>
    admin.from("dist_wa_events").insert({ company_id: conversation.company_id, business_unit_id: unitId, conversation_id: conversationId, severity, event_type: type, message });

  // Tope de gasto diario de Claude.
  const { data: usageToday } = await admin
    .from("dist_wa_usage_daily")
    .select("cost_usd")
    .eq("business_unit_id", unitId)
    .eq("usage_date", santiagoToday())
    .maybeSingle();
  if (usageToday && Number(usageToday.cost_usd) >= Number(settings.daily_budget_usd)) {
    await log("warning", "budget_exceeded", "Se alcanzó el tope de gasto diario de Claude: el asistente no responde hasta mañana.");
    return { status: "skipped", reason: "budget" };
  }

  const { data: history } = await admin
    .from("dist_wa_messages")
    .select("id,direction,sender_type,message_type,content,delivery_status,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(50);
  const messages: (LuciaHistoryMessage & { id: string })[] = ((history ?? []) as (Omit<LuciaHistoryMessage, "sender_type"> & { id: string; sender_type: string })[])
    .reverse()
    .map((m) => ({ ...m, sender_type: m.sender_type === "assistant" ? "lucia" : (m.sender_type as LuciaHistoryMessage["sender_type"]) }));
  const last = messages.at(-1);
  if (!last || last.sender_type !== "customer") return { status: "skipped", reason: "nothing_to_answer" };

  try {
    // ¿Quién escribe? Por el teléfono del chat, entre los clientes registrados.
    const { data: found } = conversation.contact_phone
      ? await admin.rpc("dist_wa_find_customers", { target_unit: unitId, contact_number: conversation.contact_phone })
      : { data: [] };
    const customers = (found ?? []) as {
      id: string; code: string; name: string; address: string; classification: string; has_credit: boolean; credit_status: string; commercial_block: boolean;
    }[];
    const chosen = customers.length === 1 ? customers[0].id : customers.find((c) => c.id === conversation.customer_id)?.id ?? null;
    const customerContext: DistCustomerContext[] = customers.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      address: c.address,
      classification: c.classification,
      hasCredit: c.has_credit,
      creditAvailable: c.has_credit && c.credit_status === "current" && !c.commercial_block,
    }));

    let products: DistProductContext[] = [];
    let recent: DistRecentOrder[] = [];
    if (chosen) {
      const [{ data: prices }, { data: orders }] = await Promise.all([
        admin.rpc("dist_wa_price_list", { target_unit: unitId, target_customer: chosen }),
        admin
          .from("dist_orders")
          .select("order_number,delivery_date,status,total,dist_order_lines(planned_quantity,dist_products(name))")
          .eq("customer_id", chosen)
          .is("deleted_at", null)
          .not("status", "in", "(cancelled,voided)")
          .order("delivery_date", { ascending: false })
          .limit(4),
      ]);
      products = ((prices ?? []) as { code: string; name: string; unit_price: number | null }[]).map((p) => ({ code: p.code, name: p.name, price: p.unit_price === null ? null : Number(p.unit_price) }));
      recent = (orders ?? []).map((o) => ({
        number: o.order_number,
        date: o.delivery_date,
        status: STATUS_LABEL[o.status] ?? o.status,
        total: Number(o.total),
        lines: ((o.dist_order_lines ?? []) as unknown as { planned_quantity: number; dist_products: { name: string } | { name: string }[] | null }[])
          .map((l) => `${Number(l.planned_quantity)} × ${(Array.isArray(l.dist_products) ? l.dist_products[0] : l.dist_products)?.name ?? "producto"}`)
          .join(", "),
      }));
    } else {
      const { data: prices } = await admin.rpc("dist_wa_price_list", { target_unit: unitId, target_customer: null });
      products = ((prices ?? []) as { code: string; name: string; unit_price: number | null }[]).map((p) => ({ code: p.code, name: p.name, price: null }));
    }

    const turns = buildChatTurns(messages, settings.history_messages);
    const result = await generateDistReply({
      model: settings.model,
      knowledge: buildDistKnowledge(settings.agent_name, settings.general_instructions),
      turns,
      contextNote: buildDistContextNote({
        today: todayInChile(),
        todayIso: santiagoToday(),
        customers: customerContext,
        chosenCustomerId: chosen,
        products,
        weekdays: settings.delivery_weekdays as number[],
        cutoff: String(settings.same_day_cutoff).slice(0, 5),
        recent,
        contactName: conversation.contact_name,
      }),
      tools: {
        admin,
        unitId,
        conversationId,
        customers: customerContext.map((c) => ({ id: c.id, name: c.name, address: c.address, hasCredit: c.hasCredit, creditAvailable: c.creditAvailable })),
        customerText: currentInquiryCustomerText(messages),
        todayIso: santiagoToday(),
        simulate,
      },
    });

    const { error: usageError } = await admin.rpc("dist_wa_record_usage", {
      payload: {
        business_unit_id: unitId,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_read_tokens: result.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: result.usage.cache_creation_input_tokens ?? 0,
        cost_usd: usageCostUsd(settings.model, result.usage),
      },
    });
    if (usageError) throw new Error(usageError.message);

    if (result.output.needs_human && !result.state.flagged) {
      await admin.rpc("dist_wa_flag_conversation", {
        target_conversation: conversationId,
        reason: result.output.reason ?? "El asistente pide ayuda del encargado",
        summary: "",
        simulated: simulate,
      });
    }
    // En el simulador la respuesta queda como enviada; en WhatsApp queda en cola para el worker.
    const now = new Date().toISOString();
    const { data: saved, error } = await admin
      .from("dist_wa_messages")
      .insert({
        company_id: conversation.company_id,
        business_unit_id: unitId,
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "assistant",
        message_type: "text",
        content: result.output.reply,
        delivery_status: simulate ? "sent" : "queued",
        sent_at: simulate ? now : null,
      })
      .select("id")
      .single();
    if (error || !saved) throw new Error(error?.message ?? "No se pudo guardar la respuesta.");
    return { status: "replied", messageId: saved.id, ordered: Boolean(result.state.created) };
  } catch (error) {
    const message = error instanceof DistBrainError || error instanceof Error ? error.message : "Error desconocido al generar la respuesta.";
    await log("error", "ai_error", message);
    return { status: "error", message };
  }
}
