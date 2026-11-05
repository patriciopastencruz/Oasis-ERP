/**
 * Huésped con reserva que pide algo de su estadía (la clave del Wi-Fi, por
 * ejemplo): Lucía no tiene esos datos, así que le entrega el teléfono de
 * recepción de su hostal para que lo coordine directo con ellos.
 */

const plain = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Pide la clave o el acceso al Wi-Fi? */
export function asksForWifi(message: string) {
  return /\bwi[\s-]?fi\b|\binternet\b/.test(plain(message));
}

/** «+56973999995» → «+56 9 7399 9995» (celular chileno); otros quedan igual. */
export function displayPhone(phone: string) {
  const cl = phone.match(/^\+56(9)(\d{4})(\d{4})$/);
  return cl ? `+56 ${cl[1]} ${cl[2]} ${cl[3]}` : phone;
}

export function receptionContactLine(hostelName: string, phone: string) {
  return `📞 Recepción de ${hostelName}: ${displayPhone(phone)} (WhatsApp o llamada)`;
}

/** Respuesta a la clave del Wi-Fi: con el número de recepción, o el aviso al equipo si no está configurado. */
export function wifiReply(hostelName: string, phone: string | null) {
  return phone
    ? `La clave del Wi-Fi te la entrega directamente recepción 😊 Escríbeles o llámalos:\n${receptionContactLine(hostelName, phone)}`
    : `La clave del Wi-Fi te la entrega directamente recepción 😊 Ya les avisé para que te escriban en breve. 🙏`;
}
