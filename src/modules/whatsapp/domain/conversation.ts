export const conversationStatuses = [
  "ai_active",
  "human_required",
  "human_active",
  "paused",
  "closed",
] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];

export const conversationStatusLabels: Record<ConversationStatus, string> = {
  ai_active: "IA respondiendo",
  human_required: "Requiere vendedor",
  human_active: "Atendida por vendedor",
  paused: "IA pausada",
  closed: "Cerrada",
};

/**
 * Refleja, para la UI, lo que las funciones de Postgres realmente permiten
 * (whatsapp_take_conversation / whatsapp_release_to_ai / whatsapp_pause_agent
 * / whatsapp_assign_conversation / whatsapp_close_conversation /
 * whatsapp_escalate_to_human) — la aplicación real de la transición ocurre
 * en el servidor, esto solo evita mostrar botones que van a fallar.
 */
export const allowedConversationStatusTransitions: Readonly<
  Record<ConversationStatus, readonly ConversationStatus[]>
> = {
  ai_active: ["human_required", "human_active", "paused", "closed"],
  human_required: ["human_active", "ai_active", "paused", "closed"],
  human_active: ["ai_active", "paused", "closed"],
  paused: ["ai_active", "human_active", "human_required", "closed"],
  closed: [],
};

export function canTransitionConversationStatus(
  from: ConversationStatus,
  to: ConversationStatus,
): boolean {
  return allowedConversationStatusTransitions[from].includes(to);
}

export const senderTypes = ["customer", "ai", "human", "system"] as const;
export type SenderType = (typeof senderTypes)[number];

export const messageTypes = [
  "text",
  "image",
  "audio",
  "document",
  "location",
  "template",
  "unsupported",
] as const;
export type MessageType = (typeof messageTypes)[number];

/**
 * Mismo criterio que la palabra completa `\y(baja|stop|cancelar)\y` usada
 * en whatsapp_ingest_inbound_message: solo dispara si el mensaje ES una de
 * esas palabras (con espacios/puntuación alrededor), no si aparecen dentro
 * de otra palabra o frase larga.
 */
const OPT_OUT_PATTERN = /\b(baja|stop|cancelar)\b/i;

export function detectOptOut(content: string | null | undefined): boolean {
  if (!content) return false;
  return OPT_OUT_PATTERN.test(content.trim());
}
