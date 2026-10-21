export type BookingState = {
  booking_status: string;
  booking_total: number | string | null;
  booking_deposit: number | string | null;
  hold_expires_at: string | null;
};

const clp = (n: number | string | null) => `$${Math.round(Number(n ?? 0)).toLocaleString("es-CL")}`;
const hour = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Estado de la reserva para Lucía, en palabras. Va en el contexto del último
 * turno (fuera del prefijo en caché) para que no pida pagos antes de tiempo
 * ni repita datos que el sistema ya envió.
 */
export function describeBookingState(state: BookingState): string | null {
  switch (state.booking_status) {
    case "awaiting_reception":
      return "Estado de la reserva: ya se pidió a recepción confirmar la disponibilidad y aún no responde. Dile al cliente que estás esperando la confirmación; no pidas pagos ni des datos de pago.";
    case "awaiting_payment":
      return `Estado de la reserva: recepción confirmó y el sistema ya envió al cliente el total (${clp(state.booking_total)}), ${
        Number(state.booking_deposit) >= Number(state.booking_total)
          ? "que debe pagarse completo para confirmar"
          : `el abono (${clp(state.booking_deposit)})`
      } y los datos de transferencia. La habitación está guardada hasta las ${state.hold_expires_at ? hour(state.hold_expires_at) : "—"}. Si pregunta, recuérdale enviar el comprobante por este chat; no repitas los datos bancarios.`;
    case "proof_received":
      return "Estado de la reserva: el cliente ya envió el comprobante y el encargado lo está verificando. Agradécele y dile que le confirmamos apenas se revise el pago.";
    case "confirmed":
      return "Estado de la reserva: la reserva está confirmada y pagada (abono o total). Responde sus dudas sobre la estadía.";
    case "expired":
      return "Estado de la reserva: venció el plazo para el abono y se liberó la habitación. Si el cliente aún quiere reservar, vuelve a consultar disponibilidad.";
    case "rejected":
      return "Estado de la reserva: recepción indicó que esa opción no estaba disponible. Ofrece revisar otra habitación, hostal o fechas.";
    default:
      return null;
  }
}
