/** Solo los dígitos de un teléfono: "+56 9 1234-5678" → "56912345678". */
export const phoneDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/** Un teléfono se identifica por sus últimos 8 dígitos, sin importar prefijo (+56, 9) ni separadores. */
const PHONE_TAIL = 8;

/** ¿Lo escrito en el buscador es un teléfono? Basta con 8 o más dígitos y casi nada más. */
export function searchAsPhone(query: string) {
  const digits = phoneDigits(query);
  return digits.length >= PHONE_TAIL && /^[\d\s+()-]+$/.test(query.trim()) ? digits : null;
}

export function phoneMatches(stored: string | null | undefined, searched: string) {
  const a = phoneDigits(stored);
  const b = phoneDigits(searched);
  if (a.length < PHONE_TAIL || b.length < PHONE_TAIL) return false;
  return a.slice(-PHONE_TAIL) === b.slice(-PHONE_TAIL);
}

/**
 * Patrón `ilike` que admite cualquier separador entre los últimos dígitos ("1234 5678", "12-34..."):
 * filtra en la base de datos y luego `phoneMatches` confirma la coincidencia exacta.
 */
export function phoneLikePattern(searched: string) {
  return `%${phoneDigits(searched).slice(-PHONE_TAIL).split("").join("%")}%`;
}
