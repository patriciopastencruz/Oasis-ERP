/** Evita enviar dos veces el mismo resumen de opciones y precios en una conversación. */

type Turn = { role: string; content: string };

/** ¿Alguno de los mensajes de Lucía ya trae este resumen completo? */
export function summaryAlreadySent(turns: Turn[], summary: string | null) {
  return !!summary && turns.some((t) => t.role === "assistant" && t.content.includes(summary));
}

/** ¿La respuesta copia el resumen (dos o más de sus líneas con precio)? */
export function repeatsSummary(reply: string, summary: string | null) {
  if (!summary) return false;
  const lines = summary.split("\n").filter((l) => /\$\s?\d/.test(l));
  const copied = lines.filter((l) => reply.includes(l)).length;
  return copied >= Math.min(2, lines.length) && copied > 0;
}

export const ALREADY_SENT_REPLY =
  "Las opciones con sus precios están en mi mensaje anterior 😊 ¿Te acomoda alguna, o prefieres que revise otras fechas?";
