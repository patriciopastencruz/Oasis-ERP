type PaymentReservation = { status: string; payments_retained?: boolean | null };

/**
 * Un pago es ingreso salvo que su reserva esté anulada o en conflicto: al anular y volver a crear
 * una reserva, el pago se registra de nuevo en la nueva y se contaría dos veces. Si al anular se
 * decidió retener el dinero, sus pagos sí son ingreso.
 */
export function paymentCountsAsIncome(reservation: PaymentReservation | PaymentReservation[] | null | undefined) {
  const r = Array.isArray(reservation) ? reservation[0] : reservation;
  return !r || !["cancelled", "conflict"].includes(r.status) || !!r.payments_retained;
}
