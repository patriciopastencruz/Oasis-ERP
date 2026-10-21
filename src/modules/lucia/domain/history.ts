export type LuciaHistoryMessage = {
  direction: "inbound" | "outbound";
  sender_type: "customer" | "lucia" | "human" | "system";
  message_type: string;
  content: string | null;
  delivery_status: string;
  created_at?: string;
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

/** Un silencio de 3 horas o más separa una consulta de la anterior. */
export const NEW_INQUIRY_GAP_MS = 3 * 60 * 60 * 1000;

export const NEW_INQUIRY_NOTE =
  "[Nota del sistema: este mensaje llega horas después de la conversación anterior. Trátalo como una consulta nueva: no reutilices fechas, personas ni opciones de antes sin que el cliente las vuelva a indicar.]";

function startsNewInquiry(prev: LuciaHistoryMessage | undefined, message: LuciaHistoryMessage) {
  if (!prev?.created_at || !message.created_at) return false;
  return Date.parse(message.created_at) - Date.parse(prev.created_at) >= NEW_INQUIRY_GAP_MS;
}

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
  recent.forEach((message, index) => {
    const role = message.direction === "inbound" ? "user" : "assistant";
    const body =
      message.message_type === "text"
        ? (message.content ?? "").trim()
        : NON_TEXT_LABEL[message.message_type] ?? NON_TEXT_LABEL.other;
    if (!body) return;
    const text =
      role === "user" && startsNewInquiry(recent[index - 1], message) ? `${NEW_INQUIRY_NOTE}\n${body}` : body;
    const last = turns.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n${text}`;
    else turns.push({ role, content: text });
  });
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}

const AFFIRMATIVE =
  /^(si|sip|sii+|correcto|correctisimo|exacto|exactamente|ok|okay|oka|dale|claro|perfecto|ya|asi es|eso|confirmo|confirmado|efectivamente|afirmativo)\b/;

/**
 * Texto con las fechas que vale la pena creer en la consulta actual (desde
 * el último silencio largo): lo que escribió el cliente, más los mensajes de
 * Lucía o del equipo que el cliente confirmó enseguida con un «sí».
 */
export function currentInquiryCustomerText(messages: LuciaHistoryMessage[]): string {
  let start = 0;
  messages.forEach((message, index) => {
    if (message.direction === "inbound" && startsNewInquiry(messages[index - 1], message)) start = index;
  });
  const inquiry = messages.slice(start).filter((m) => m.message_type === "text" && m.content);
  return inquiry
    .filter((m, index) => {
      if (m.direction === "inbound") return true;
      const reply = inquiry[index + 1];
      return reply?.direction === "inbound" && AFFIRMATIVE.test(normalize(reply.content!));
    })
    .map((m) => m.content!.trim())
    .join("\n");
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** La cita de fechas debe aparecer tal cual (sin tildes ni signos) en lo que dijo o confirmó el cliente. */
export function clientSaidIt(quote: unknown, customerText: string): boolean {
  if (typeof quote !== "string") return false;
  const q = normalize(quote);
  return q.length >= 2 && ` ${normalize(customerText)} `.includes(` ${q} `);
}
