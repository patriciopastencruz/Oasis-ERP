export type LuciaHistoryMessage = {
  direction: "inbound" | "outbound";
  sender_type: "customer" | "lucia" | "human" | "system";
  message_type: string;
  content: string | null;
  delivery_status: string;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

const NON_TEXT_LABEL: Record<string, string> = {
  audio: "[El cliente envió un audio]",
  image: "[El cliente envió una imagen]",
  video: "[El cliente envió un video]",
  document: "[El cliente envió un documento]",
  sticker: "[El cliente envió un sticker]",
  location: "[El cliente envió una ubicación]",
  contact: "[El cliente envió un contacto]",
  other: "[Mensaje no textual]",
};

/**
 * Convierte los últimos mensajes de la conversación en turnos para Claude:
 * cliente = user; Lucía y el equipo = assistant. Junta mensajes seguidos del
 * mismo lado (en WhatsApp la gente escribe en varias burbujas), descarta los
 * envíos fallidos y garantiza que el primer turno sea del cliente.
 */
export function buildChatTurns(
  messages: LuciaHistoryMessage[],
  limit: number,
): ChatTurn[] {
  const recent = messages
    .filter((m) => m.sender_type !== "system" && m.delivery_status !== "failed")
    .slice(-limit);
  const turns: ChatTurn[] = [];
  for (const message of recent) {
    const role = message.direction === "inbound" ? "user" : "assistant";
    const text =
      message.message_type === "text"
        ? (message.content ?? "").trim()
        : NON_TEXT_LABEL[message.message_type] ?? NON_TEXT_LABEL.other;
    if (!text) continue;
    const last = turns.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n${text}`;
    else turns.push({ role, content: text });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}
