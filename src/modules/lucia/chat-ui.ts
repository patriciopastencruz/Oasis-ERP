/** Ayudas de presentación de la app «Oasis Chats» (sin acceso a datos). */

type AttentionRow = {
  needs_review: boolean;
  booking_status: string;
  unanswered_since: string | null;
};

/** Lucía responde en segundos: un mensaje sin respuesta por más de 2 minutos espera a una persona. */
const UNANSWERED_MS = 2 * 60 * 1000;

/** Chats que requieren a alguien del equipo: derivados, reservas por confirmar o pagos por revisar, o sin respuesta. */
export function needsAttention(row: AttentionRow, now = new Date()) {
  if (row.needs_review) return true;
  if (row.booking_status === "awaiting_reception" || row.booking_status === "proof_received") return true;
  return !!row.unanswered_since && now.getTime() - new Date(row.unanswered_since).getTime() > UNANSWERED_MS;
}

const MEDIA: Record<string, string> = {
  image: "📷 Foto",
  audio: "🎤 Audio",
  video: "🎥 Video",
  document: "📄 Documento",
  sticker: "Sticker",
  location: "📍 Ubicación",
  contact: "👤 Contacto",
};

type PreviewMessage = { direction: string; sender_type: string; message_type: string; content: string | null } | undefined;

/** Última línea del chat como en WhatsApp: quién la escribió y el texto (o el tipo de archivo). */
export function previewText(m: PreviewMessage) {
  if (!m) return "Sin mensajes";
  const body = m.message_type === "text" ? (m.content ?? "").replace(/\s+/g, " ").trim() : MEDIA[m.message_type] ?? "Mensaje";
  const who = m.direction === "inbound" ? "" : m.sender_type === "lucia" ? "Lucía: " : m.sender_type === "human" ? "Equipo: " : "";
  return `${who}${body}`;
}

const timeFormat = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFormat = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" });

/** Hora si fue hoy, «Ayer» o la fecha (dd-mm), como la lista de WhatsApp. */
export function chatTime(iso: string | null, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = dayKey.format(now);
  const yesterday = dayKey.format(new Date(now.getTime() - 86_400_000));
  const key = dayKey.format(d);
  if (key === today) return timeFormat.format(d);
  if (key === yesterday) return "Ayer";
  return dayFormat.format(d).replace("/", "-");
}

/** Hora corta de cada burbuja. */
export function bubbleTime(iso: string) {
  return timeFormat.format(new Date(iso));
}

/** Separador de día dentro del chat («Hoy», «Ayer» o la fecha larga). */
export function daySeparator(iso: string, now = new Date()) {
  const label = chatTime(iso, now);
  if (label === "Ayer") return "Ayer";
  if (label.includes(":")) return "Hoy";
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
