/**
 * Día al que corresponde un pago, igual que `lodging_payment_day` en la base:
 * - pagado antes de llegar (abono)             → día de ingreso;
 * - pagado durante la estadía (noche siguiente,
 *   extensión)                                  → día en que se pagó;
 * - pagado el día de salida o después
 *   (regularización)                            → última noche de la estadía.
 * Sin fechas de estadía se usa el día del pago.
 */

const santiagoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" });

function previousDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function paymentDay(paidAt: string, checkIn?: string | null, checkOut?: string | null) {
  const paid = santiagoDay.format(new Date(paidAt));
  if (!checkIn || !checkOut) return paid;
  if (paid < checkIn) return checkIn;
  if (paid >= checkOut) {
    const lastNight = previousDay(checkOut);
    return lastNight > checkIn ? lastNight : checkIn;
  }
  return paid;
}

/** Margen de días para leer pagos de otros días que pueden corresponder al rango (abonos anticipados y regularizaciones). */
export const PAYMENT_DAY_MARGIN_DAYS = 45;
