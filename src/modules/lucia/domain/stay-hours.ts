/**
 * Horarios de acceso y cobro por noche. El precio es por noche completa (entrada
 * desde el check-in hasta la salida del día siguiente): no hay tarifa por horas
 * ni descuento por irse antes, aunque el cliente diga que se queda hasta cierta hora.
 */

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const hhmm = (time: string) => time.slice(0, 5);

/** Frase con los horarios si todas las hostales comparten los mismos; null si difieren o faltan. */
export function accessSentence(hostels: { checkin_time: string | null; checkout_time: string | null }[]) {
  const times = new Set(hostels.map((h) => `${h.checkin_time ?? ""}|${h.checkout_time ?? ""}`));
  if (times.size !== 1) return null;
  const [checkIn, checkOut] = [...times][0].split("|");
  if (!checkIn || !checkOut) return null;
  return `el check-in es desde las ${hhmm(checkIn)} y el check-out hasta las ${hhmm(checkOut)} del día siguiente`;
}

const SHORT_STAY =
  /\bhasta (?:las )?(?:12|doce)\b|\bhasta (?:el )?medio ?dia\b|\b(?:por|solo|solamente|nomas) (?:unas |algunas |pocas )?horas\b|\b(?:nos )?quedamos hasta\b|\bme quedo hasta\b/;

/** ¿El cliente dice que se queda solo hasta cierta hora o por unas horas? */
export function mentionsShortStay(text: string) {
  return SHORT_STAY.test(plain(text));
}

/** Aclaración fija: se cobra la noche completa y el precio es uno solo. */
export function nightlyChargeNote(access: string | null) {
  return [
    access ? `Te cuento cómo funciona: ${access}.` : "Te cuento cómo funciona nuestro horario.",
    "Cobramos por noche completa dentro de ese horario, y el precio es uno solo: es el mismo aunque te quedes menos horas o te vayas antes de la salida. 😊",
  ].join(" ");
}
