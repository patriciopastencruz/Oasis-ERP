type PaymentReservation = { status: string };

/**
 * Un pago es ingreso salvo que su reserva esté anulada o en conflicto: al anular y volver a crear
 * una reserva, el pago se registra de nuevo en la nueva y se contaría dos veces.
 */
export function paymentCountsAsIncome(reservation: PaymentReservation | PaymentReservation[] | null | undefined) {
  const r = Array.isArray(reservation) ? reservation[0] : reservation;
  return !r || !["cancelled", "conflict"].includes(r.status);
}
