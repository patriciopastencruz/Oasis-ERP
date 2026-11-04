import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatTurns, currentInquiryCustomerText, type LuciaHistoryMessage } from "@/modules/lucia/domain/history";
import { usageCostUsd } from "@/modules/lucia/domain/pricing";
import { describeBookingState } from "@/modules/lucia/domain/booking-context";
import { hostelAddress, receptionState, type ClosedHostel } from "@/modules/lucia/domain/reception-hours";
import { buildKnowledgeBlock, type LuciaHostelKnowledge } from "@/modules/lucia/domain/prompt";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { checkLuciaAvailability } from "./availability-tool";
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
    .select("id,company_id,business_unit_id,status,paused_until,hostel_assigned,guest_name,booking_status,booking_total,booking_deposit,hold_expires_at,cheaper_shared_from")
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
      .select("id,direction,sender_type,message_type,content,delivery_status,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (!settings) return { status: "skipped", reason: "not_configured" };

  const messages = ((history ?? []) as (LuciaHistoryMessage & { id: string })[]).reverse();
  const last = messages.at(-1);
  if (!last || last.sender_type !== "customer")
    return { status: "skipped", reason: "nothing_to_answer" };

  const turns = buildChatTurns(messages, settings.history_messages);
  const knowledge = buildKnowledgeBlock(
    settings.agent_name,
    settings.general_instructions,
    await loadHostelKnowledge(admin, conversation.company_id),
  );
  // Hostales con la recepción cerrada ahora: no se entrega su dirección exacta
  // a quien no tiene una reserva pagada; su llegada se coordina antes.
  const { data: hostelHours } = await admin
    .from("lucia_hostels")
    .select("business_unit_id,display_name,manual,reception_open_time,reception_close_time,reception_close_time_weekend,business_units(code)")
    .eq("company_id", conversation.company_id)
    .eq("enabled", true);
  const closedHostels: ClosedHostel[] = (hostelHours ?? []).flatMap((h) => {
    const state = receptionState(h);
    const unit = Array.isArray(h.business_units) ? h.business_units[0] : h.business_units;
    return state.open
      ? []
      : [{
          code: (unit as { code?: string } | null)?.code ?? "",
          name: h.display_name,
          address: hostelAddress(h.manual),
          opens: state.opens,
          closes: state.closes,
        }];
  });
  const bookingConfirmed = conversation.booking_status === "confirmed";
  const assignedHostel = conversation.hostel_assigned
    ? (hostelHours ?? []).find((h) => h.business_unit_id === conversation.business_unit_id)
    : undefined;
  const assignedUnit = assignedHostel
    ? (Array.isArray(assignedHostel.business_units) ? assignedHostel.business_units[0] : assignedHostel.business_units)
    : null;

  try {
    const result = await generateLuciaReply({
      model: settings.model,
      knowledge,
      turns,
      today: todayInChile(),
      todayIso: santiagoToday(),
      // El nombre ya dado no se vuelve a pedir aunque haya quedado fuera del historial reciente.
      stateNote:
        [
          describeBookingState(conversation),
          conversation.guest_name ? `El cliente ya dio su nombre: ${conversation.guest_name}. No se lo vuelvas a pedir.` : null,
          closedHostels.length && !bookingConfirmed
            ? `En este momento la recepción está cerrada en: ${closedHostels.map((h) => `${h.name} (atiende de ${h.opens} a ${h.closes})`).join(", ")}. No des la dirección exacta de esas hostales ni le digas que puede llegar ahora: explícale que la llegada fuera del horario de recepción se coordina antes con recepción y que sin esa confirmación no podemos asegurar la disponibilidad ni su ingreso. Esto es SOLO si quiere llegar hoy (esta noche o de madrugada): si su llegada es otro día, aunque sea tarde, no menciones el horario de recepción ni que debe confirmar su llegada; entrégale las opciones y el precio como siempre, y recepción coordinará la hora de llegada después.`
            : null,
          conversation.cheaper_shared_from
            ? `Como pidió departamento, se le mostraron solo opciones con baño privado; también hay opciones con baño compartido desde $${Math.round(Number(conversation.cheaper_shared_from)).toLocaleString("es-CL")} por noche. No se las ofrezcas por tu cuenta; si pide algo más barato o acepta verlas, usa consultar_disponibilidad y muéstralas.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      cheaperSharedFrom: conversation.cheaper_shared_from === null ? null : Number(conversation.cheaper_shared_from),
      closedHostels: bookingConfirmed ? [] : closedHostels,
      assignedHostelCode: (assignedUnit as { code?: string } | null)?.code ?? null,
      bookingInProgress: ["awaiting_reception", "awaiting_payment", "proof_received", "confirmed"].includes(
        conversation.booking_status,
      ),
      customerText: currentInquiryCustomerText(messages),
      hostelAssigned: conversation.hostel_assigned,
      checkAvailability: (query) => checkLuciaAvailability(admin, conversation.company_id, query),
    });
    // Consultas rechazadas o fallidas: quedan en la bitácora para diagnosticar.
    if (result.issues.length) {
      await admin.rpc("lucia_record_event", {
        payload: {
          company_id: conversation.company_id,
          conversation_id: conversationId,
          severity: "warning",
          event_type: "availability_issue",
          message: result.issues.join(" · ").slice(0, 1900),
        },
      });
    }
    // Recuerda si quedaron opciones más baratas sin mostrar (las ofrece el recontacto).
    if (result.cheaperSharedFrom !== undefined) {
      await admin.from("lucia_conversations").update({ cheaper_shared_from: result.cheaperSharedFrom }).eq("id", conversationId);
    }
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
    // Cuando el cliente va directamente o ya espera en la entrada, el aviso
    // real al equipo se encola antes de decirle que fue enviado.
    if (result.output.walk_in_alert) {
      const { error: alertError } = await admin.rpc("lucia_alert_walk_in", {
        payload: {
          conversation_id: conversationId,
          status: result.output.walk_in_alert.status,
          app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
        },
      });
      if (alertError) throw new Error(alertError.message);
    }
    // El cliente eligió y quiere reservar: se pide confirmación a recepción.
    // Si la solicitud se crea, el cliente recibe solo el mensaje fijo del
    // sistema (saludo + resumen) y el texto libre de Lucía no se envía, para
    // que no lo contradiga. La base valida que la ficha esté completa.
    if (result.output.booking_request) {
      const { data: booking, error: bookingError } = await admin.rpc("lucia_request_booking", {
        payload: { conversation_id: conversationId, app_url: process.env.NEXT_PUBLIC_APP_URL ?? "" },
      });
      if (bookingError) throw new Error(bookingError.message);
      if ((booking as { ok?: boolean } | null)?.ok) {
        await admin.from("lucia_drafts").update({ status: "superseded" }).eq("id", draftId);
        return { status: "draft", draftId: draftId as string, autoSent: true };
      }
    }
    // La base decide si se envía sola (modo automático, sin derivación,
    // sin pausa y dentro del tope de gasto) o queda como borrador.
    const { data: auto, error: autoError } = await admin.rpc("lucia_auto_send_draft", {
      target_draft: draftId,
      answered_message: last.id,
    });
    if (autoError) throw new Error(autoError.message);
    // Fotos a pedido: solo si la respuesta se envió sola (en modo borrador
    // las fotos irían sin el texto que las acompaña).
    if (result.output.photos && (auto as { sent?: boolean } | null)?.sent) {
      const { error: photosError } = await admin.rpc("lucia_queue_photos", {
        payload: { conversation_id: conversationId, ...result.output.photos },
      });
      if (photosError) throw new Error(photosError.message);
    }
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
  const [{ data: rooms }, { data: photos }] = unitIds.length
    ? await Promise.all([
        admin
          .from("lodging_rooms")
          .select("business_unit_id,room_type,name,capacity")
          .in("business_unit_id", unitIds)
          .eq("active", true),
        admin
          .from("lucia_room_photos")
          .select("business_unit_id,room_type")
          .in("business_unit_id", unitIds)
          .is("deleted_at", null),
      ])
    : [{ data: [] }, { data: [] }];
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
      photoTypes: [
        ...new Set((photos ?? []).filter((ph) => ph.business_unit_id === h.business_unit_id).map((ph) => ph.room_type as string)),
      ],
    };
  });
}
