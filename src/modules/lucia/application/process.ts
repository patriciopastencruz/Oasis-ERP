import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatTurns, type LuciaHistoryMessage } from "@/modules/lucia/domain/history";
import { usageCostUsd } from "@/modules/lucia/domain/pricing";
import { buildKnowledgeBlock, type LuciaHostelKnowledge } from "@/modules/lucia/domain/prompt";
import { generateLuciaReply, LuciaBrainError } from "./brain";

export type ProcessResult =
  | { status: "draft"; draftId: string; autoSent: boolean }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

function todayInChile() {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

/**
 * Genera el borrador de Lucía para la última consulta del cliente.
 * Si la hostal está en modo automático y el caso no requiere a una persona,
 * el borrador se envía solo (lucia_auto_send_draft); si no, espera aprobación.
 * Recibe el cliente de servicio porque lo llama el worker (sin sesión) y el
 * simulador después de validar permisos con la sesión del usuario.
 */
export async function processLuciaConversation(
  admin: SupabaseClient,
  conversationId: string,
): Promise<ProcessResult> {
  const { data: conversation } = await admin
    .from("lucia_conversations")
    .select("id,company_id,status,paused_until")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { status: "skipped", reason: "not_found" };
  if (conversation.status !== "lucia") return { status: "skipped", reason: conversation.status };
  if (conversation.paused_until && new Date(conversation.paused_until) > new Date())
    return { status: "skipped", reason: "paused" };

  const [{ data: settings }, { data: history }] = await Promise.all([
    admin
      .from("lucia_settings")
      .select("agent_name,general_instructions,model,history_messages")
      .eq("company_id", conversation.company_id)
      .single(),
    admin
      .from("lucia_messages")
      .select("id,direction,sender_type,message_type,content,delivery_status")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (!settings) return { status: "skipped", reason: "not_configured" };

  const messages = ((history ?? []) as (LuciaHistoryMessage & { id: string })[]).reverse();
  const last = messages.at(-1);
  if (!last || last.sender_type !== "customer")
    return { status: "skipped", reason: "nothing_to_answer" };
  if (last.message_type !== "text") return { status: "skipped", reason: "needs_review" };

  const turns = buildChatTurns(messages, settings.history_messages);
  const knowledge = buildKnowledgeBlock(
    settings.agent_name,
    settings.general_instructions,
    await loadHostelKnowledge(admin, conversation.company_id),
  );

  try {
    const result = await generateLuciaReply({
      model: settings.model,
      knowledge,
      turns,
      today: todayInChile(),
    });
    const costUsd = usageCostUsd(settings.model, result.usage);
    const tokens = {
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cache_read_tokens: result.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: result.usage.cache_creation_input_tokens ?? 0,
      cost_usd: costUsd,
    };
    const { error: usageError } = await admin.rpc("lucia_record_usage", {
      payload: { company_id: conversation.company_id, ...tokens },
    });
    if (usageError) throw new Error(usageError.message);
    const { data: draftId, error } = await admin.rpc("lucia_record_draft", {
      payload: {
        conversation_id: conversationId,
        content: result.output.reply,
        intent: result.output.intent,
        needs_human: result.output.needs_human,
        reason: result.output.reason,
        extracted: {
          ...result.output.prospect,
          answered_from_manual: result.output.answered_from_manual,
        },
        model: result.model,
        ...tokens,
      },
    });
    if (error) throw new Error(error.message);
    // La base decide si se envía sola (modo automático, sin derivación,
    // sin pausa y dentro del tope de gasto) o queda como borrador.
    const { data: auto, error: autoError } = await admin.rpc("lucia_auto_send_draft", {
      target_draft: draftId,
      answered_message: last.id,
    });
    if (autoError) throw new Error(autoError.message);
    return {
      status: "draft",
      draftId: draftId as string,
      autoSent: Boolean((auto as { sent?: boolean } | null)?.sent),
    };
  } catch (error) {
    const message =
      error instanceof LuciaBrainError || error instanceof Error
        ? error.message
        : "Error desconocido al generar la respuesta.";
    await admin.rpc("lucia_record_event", {
      payload: {
        company_id: conversation.company_id,
        conversation_id: conversationId,
        severity: "error",
        event_type: "ai_error",
        message,
      },
    });
    return { status: "error", message };
  }
}

async function loadHostelKnowledge(
  admin: SupabaseClient,
  companyId: string,
): Promise<LuciaHostelKnowledge[]> {
  const { data: hostels } = await admin
    .from("lucia_hostels")
    .select("business_unit_id,display_name,manual,enabled,business_units(code)")
    .eq("company_id", companyId);
  const unitIds = (hostels ?? []).map((h) => h.business_unit_id);
  const { data: rooms } = unitIds.length
    ? await admin
        .from("lodging_rooms")
        .select("business_unit_id,room_type,name,capacity")
        .in("business_unit_id", unitIds)
        .eq("active", true)
    : { data: [] };
  return (hostels ?? []).map((h) => {
    const unit = Array.isArray(h.business_units) ? h.business_units[0] : h.business_units;
    return {
      code: (unit as { code?: string } | null)?.code ?? "",
      display_name: h.display_name,
      manual: h.manual,
      enabled: h.enabled,
      rooms: (rooms ?? [])
        .filter((r) => r.business_unit_id === h.business_unit_id)
        .map((r) => ({ room_type: r.room_type, name: r.name, capacity: r.capacity })),
    };
  });
}
