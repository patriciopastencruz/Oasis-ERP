/** Diferencia máxima (CLP) aceptada entre el monto del comprobante y el aprobado. */
export const RECEIPT_AMOUNT_TOLERANCE = 1;

export type PaymentMethodKey = "bank_transfer" | "card" | "check" | "cash" | "petty_cash" | "other";

export function receiptAmountMatches(read: number | null, expected: number) {
  if (read === null) return null; // no se pudo leer: no se puede afirmar nada
  return Math.abs(read - expected) <= RECEIPT_AMOUNT_TOLERANCE;
}

/** Medio de pago: lo que muestra el comprobante o, si no se distingue, el de la solicitud. */
export function paymentMethodFromReading(
  hint: "transfer" | "card" | "cash" | "other" | null,
  requestUsesSupplierBankAccount: boolean,
): PaymentMethodKey {
  if (hint === "transfer") return "bank_transfer";
  if (hint === "card") return "card";
  if (hint === "cash") return "cash";
  if (hint === "other") return "other";
  return requestUsesSupplierBankAccount ? "bank_transfer" : "cash";
}

const SANTIAGO = "America/Santiago";

function santiagoOffsetMinutes(utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SANTIAGO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/**
 * Fecha (YYYY-MM-DD) y hora (HH:MM) de reloj de Santiago → instante ISO (UTC).
 * Sin hora se usa el mediodía. Si el instante queda en el futuro se usa `now`:
 * un pago no puede registrarse con fecha posterior a hoy.
 */
export function santiagoDateTimeToIso(date: string, time: string | null, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "12:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - santiagoOffsetMinutes(wall) * 60_000;
  utc = wall - santiagoOffsetMinutes(utc) * 60_000; // segunda pasada por cambio de horario
  return new Date(Math.min(utc, now.getTime())).toISOString();
}

/** Valor de un input datetime-local ("2026-10-14T15:30") o solo fecha → ISO. */
export function localInputToIso(value: string, now = new Date()) {
  const [date, time] = value.split("T");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  return santiagoDateTimeToIso(date, /^\d{2}:\d{2}/.test(time ?? "") ? time!.slice(0, 5) : null, now);
}

/** Los medios distintos de efectivo exigen número de operación; si no se lee, se deja constancia. */
export function operationNumberFor(method: PaymentMethodKey, read: string | null) {
  const clean = read?.trim() || null;
  if (clean) return { value: clean, placeholder: false };
  if (method === "cash" || method === "petty_cash") return { value: null, placeholder: false };
  return { value: "S/N (ver comprobante)", placeholder: true };
}
