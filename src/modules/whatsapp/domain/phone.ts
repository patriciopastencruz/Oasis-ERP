const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normaliza un número recibido de Twilio (`whatsapp:+56912345678`, con
 * espacios/guiones, o un celular chileno de 9 dígitos sin `+56`) a E.164.
 * Devuelve `null` si no se puede normalizar a un número válido.
 */
export function normalizePhoneNumber(raw: string): string | null {
  let value = raw.trim().replace(/^whatsapp:/i, "");
  value = value.replace(/[\s()-]/g, "");
  if (!value) return null;
  if (!value.startsWith("+")) {
    if (/^9[0-9]{8}$/.test(value)) value = `+56${value}`;
    else if (/^56[0-9]{9}$/.test(value)) value = `+${value}`;
    else value = `+${value}`;
  }
  return E164.test(value) ? value : null;
}

/** Enmascara un teléfono para logs/eventos: conserva solo el indicativo y los últimos 2 dígitos. */
export function maskPhone(phone: string): string {
  if (phone.length <= 5) return "***";
  return `${phone.slice(0, 3)}${"*".repeat(phone.length - 5)}${phone.slice(-2)}`;
}
