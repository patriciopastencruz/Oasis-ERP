import {
  auditReservationPrice,
  type PriceAuditStatus,
} from "./reservation-price-audit";
import {
  summarizeReceiptReviews,
  type ReceiptPaymentRow,
  type ReservationReceiptStatus,
} from "./receipt-ai-review";

/** Consulta compartida por el informe en pantalla y su descarga en Excel. */
export const HISTORY_RESERVATION_SELECT =
  "id,status,origin,created_at,check_in,check_out,nights,guest_count,nightly_rate,discount,surcharge,total_value,commission,company_name,information_complete,lodging_rooms(name),lodging_guests(full_name,phone),lodging_reservation_payments(amount,type,status,lodging_payment_receipts(id,deleted_at,ai_review_status,ai_detected_amount,ai_confidence,ai_notes))";

export const auditLabels: Record<PriceAuditStatus, string> = {
  ok: "Precio correcto",
  missing_price: "Sin precio",
  missing_rate: "Solo total informado",
  mismatch: "Diferencia de precio",
};

export const originLabels: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking",
  direct: "Directa",
  whatsapp: "WhatsApp",
  company: "Empresa",
  public_web: "Sitio web",
  maintenance: "Mantención",
  other: "Otro",
};

export const receiptReviewLabels: Record<ReservationReceiptStatus, string> = {
  missing: "Sin comprobante",
  pending: "Pendiente IA",
  matched: "Monto coincide",
  mismatch: "Monto diferente",
  unreadable: "Revisión manual",
  error: "Error de revisión",
};

export function currentMonthInSantiago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

export function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

export function parseHistoryMonth(value: string | null | undefined) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "")
    ? value!
    : currentMonthInSantiago();
}

type Relation<T> = T | T[] | null | undefined;
const first = <T>(value: Relation<T>) =>
  Array.isArray(value) ? value[0] : (value ?? undefined);

type HistoryReservationRow = {
  nights: number;
  nightly_rate: number | string;
  discount: number | string;
  surcharge: number | string;
  total_value: number | string;
  lodging_reservation_payments?: unknown;
  lodging_guests?: Relation<{ full_name: string; phone: string | null }>;
  lodging_rooms?: Relation<{ name: string }>;
};

export function mapHistoryReservations<T extends HistoryReservationRow>(
  data: T[],
) {
  return data.map((reservation) => {
    const payments = (reservation.lodging_reservation_payments ??
      []) as ReceiptPaymentRow[];
    const { status: auditStatus, ...priceAudit } = auditReservationPrice({
      nights: reservation.nights,
      nightlyRate: reservation.nightly_rate,
      discount: reservation.discount,
      surcharge: reservation.surcharge,
      totalValue: reservation.total_value,
      payments,
    });
    return {
      ...reservation,
      ...priceAudit,
      auditStatus,
      receiptReview: summarizeReceiptReviews(payments),
      guest: first(reservation.lodging_guests),
      room: first(reservation.lodging_rooms),
    };
  });
}
