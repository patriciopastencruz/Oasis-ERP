import { FEED_HOSTALS } from "./availability-feed";

/** Nombre del hostal sin la aclaración entre paréntesis: "Hostal Atacama Oasis (Uruguay)" → "Hostal Atacama Oasis". */
export function hostalGreetingName(unitCode: string, fallback: string) {
  return (FEED_HOSTALS[unitCode]?.name ?? fallback).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Primera línea según la fecha: el mismo día, una llegada futura o una estadía en curso. */
function arrivalLead(checkIn?: string, today?: string) {
  if (!checkIn || !today || checkIn === today) return "Hoy es tu día de llegada:";
  if (checkIn > today) return `Tu llegada es el ${checkIn.split("-").reverse().join("-")}:`;
  return "Información de tu estadía:";
}

/**
 * Mensaje de bienvenida para el día de llegada: horarios, desayuno (solo Cobija),
 * link de check-in online y el texto de "Información de llegada" del hostal.
 */
export function arrivalMessage(input: { unitCode: string; unitName: string; guestName?: string | null; checkinUrl?: string | null; info?: string | null; checkIn?: string; today?: string }) {
  const hostal = hostalGreetingName(input.unitCode, input.unitName);
  const name = input.guestName && !/^reserva /i.test(input.guestName) ? input.guestName.trim().split(/\s+/)[0] : null;
  const lines = [
    `${name ? `Hola ${name}` : "Hola"}, ¡te damos la bienvenida a ${hostal}! 🏨`,
    "",
    arrivalLead(input.checkIn, input.today),
    "• Entrada desde las 14:00 y salida a las 12:00.",
  ];
  if (FEED_HOSTALS[input.unitCode]?.breakfast) lines.push("• Tu desayuno está incluido.");
  if (input.checkinUrl) lines.push(`• Para agilizar tu llegada, completa tu check-in online aquí: ${input.checkinUrl}`);
  const info = input.info?.trim();
  if (info) lines.push("", info);
  lines.push("", "Si necesitas algo, escríbenos por este mismo WhatsApp. ¡Te esperamos!");
  return lines.join("\n");
}
