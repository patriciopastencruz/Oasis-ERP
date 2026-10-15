type Receipt = { id: string; deleted_at: string | null };
type Payment = {
  status: string;
  amount?: number | string | null;
  type?: string | null;
  lodging_payment_receipts?: Receipt[] | Receipt | null;
};

export type HoverPayment = "paid" | "partial" | "unpaid" | "postpaid" | "no_price";
export type HoverReceipt = "ok" | "missing" | "partial" | "none";

const receiptsOf = (payment: Payment) =>
  (Array.isArray(payment.lodging_payment_receipts)
    ? payment.lodging_payment_receipts
    : payment.lodging_payment_receipts
      ? [payment.lodging_payment_receipts]
      : []
  ).filter((r) => !r.deleted_at);

/**
 * Resumen de pago y comprobante para el recuadro que aparece al pasar el mouse
 * por una reserva del calendario. Los reembolsos restan; solo cuentan los pagos
 * confirmados. El comprobante está "ok" cuando cada pago confirmado tiene al
 * menos uno vigente (los eliminados no cuentan).
 */
export function summarizeReservationHover(input: {
  total_value: number | string;
  postpaid_company?: boolean | null;
  lodging_reservation_payments?: Payment[] | null;
}) {
  const total = Number(input.total_value) || 0;
  const confirmed = (input.lodging_reservation_payments ?? []).filter((p) => p.status === "confirmed");
  const paid = confirmed.reduce(
    (sum, p) => sum + (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0),
    0,
  );
  const balance = Math.max(0, total - paid);
  const payment: HoverPayment = input.postpaid_company
    ? "postpaid"
    : total <= 0
      ? "no_price"
      : paid >= total
        ? "paid"
        : paid > 0
          ? "partial"
          : "unpaid";
  const withReceipt = confirmed.filter((p) => receiptsOf(p).length > 0).length;
  const receipt: HoverReceipt = !confirmed.length
    ? "none"
    : withReceipt === confirmed.length
      ? "ok"
      : withReceipt === 0
        ? "missing"
        : "partial";
  return { total, paid, balance, payment, receipt, payments: confirmed.length, withReceipt };
}

/** "17:19:00" → "17:19"; timestamp ISO → hora de Santiago "HH:MM"; vacío → null. */
export function hourLabel(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
