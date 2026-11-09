import { Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import {
  decideReservationCancellationAction,
  requestReservationCancellationAction,
  settleCancelledPaymentsAction,
} from "@/modules/lodging/application/actions";

export type CancellationRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  paid_amount: number;
  requested_at: string;
  decided_at: string | null;
  decision_notes: string | null;
  requester: string | null;
  decider: string | null;
  payments_action: PaymentsAction | null;
};

export type PaymentsAction = "void" | "refund" | "move" | "retain";
/** Reserva vigente a la que se pueden trasladar los pagos (mismo huésped o misma habitación). */
export type MoveCandidate = { id: string; label: string };

export const paymentsActionLabel: Record<PaymentsAction, string> = {
  void: "Anular los pagos (registro repetido o error)",
  refund: "Se devolvieron al huésped",
  move: "Trasladarlos a otra reserva",
  retain: "Se retienen: el hostal se queda con el dinero",
};

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
const when = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const field = "w-full rounded-xl border px-3 py-2 text-sm";

/**
 * Qué hacer con los pagos de la reserva que se anula. Anular o devolver pagos lo decide quien puede
 * anular pagos; si no, la anulación pasa a aprobación (la base aplica la misma regla).
 */
function PaymentsDecision({ candidates, canVoidPayments }: { candidates: MoveCandidate[]; canVoidPayments: boolean }) {
  return (
    <fieldset className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <legend className="px-1 text-xs font-semibold text-amber-900">¿Qué pasa con los pagos?</legend>
      {(Object.keys(paymentsActionLabel) as PaymentsAction[]).map((a) => (
        <label key={a} className={`flex items-start gap-2 text-sm ${a === "move" && !candidates.length ? "opacity-50" : ""}`}>
          <input type="radio" name="payments_action" value={a} required disabled={a === "move" && !candidates.length} className="mt-1" />
          <span>
            {paymentsActionLabel[a]}
            {(a === "void" || a === "refund") && !canVoidPayments && (
              <span className="block text-xs text-amber-800">Requiere aprobación del administrador.</span>
            )}
            {a === "move" && !candidates.length && <span className="block text-xs">No hay otra reserva vigente del huésped o la habitación.</span>}
          </span>
        </label>
      ))}
      {candidates.length > 0 && (
        <select name="payments_move_to" className={`${field} bg-white`} defaultValue="">
          <option value="">Reserva de destino (si se trasladan)</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}

/**
 * Anulación de la reserva. Las que empiezan hoy o después se anulan de
 * inmediato con motivo; las que empezaron en días anteriores las solicita
 * recepción y las aprueba el administrador o superior (quien ya puede aprobar
 * anula directo). La reserva no se borra: queda anulada y registrada.
 */
export function ReservationCancellation({
  reservationId,
  status,
  importedFromIcal,
  totalPaid,
  cancellationReason,
  latest,
  canRequest,
  canApprove,
  startsTodayOrLater,
  paymentsRetained,
  moveCandidates,
  canVoidPayments,
  canSettlePayments,
}: {
  reservationId: string;
  status: string;
  importedFromIcal: boolean;
  totalPaid: number;
  cancellationReason: string | null;
  latest: CancellationRequest | null;
  canRequest: boolean;
  canApprove: boolean;
  /** Las reservas del día o futuras no requieren aprobación (misma regla que la base). */
  startsTodayOrLater: boolean;
  paymentsRetained: boolean;
  moveCandidates: MoveCandidate[];
  /** Puede anular o devolver pagos sin aprobación (anular pagos o aprobar anulaciones). */
  canVoidPayments: boolean;
  /** Puede resolver los pagos de una reserva ya anulada (registrar pagos o aprobar anulaciones). */
  canSettlePayments: boolean;
}) {
  const immediate = canApprove || startsTodayOrLater;
  const pending = latest?.status === "pending" ? latest : null;
  const cancellable = !importedFromIcal && !["cancelled", "checked_in", "checked_out"].includes(status);

  if (status === "cancelled")
    return (
      <Panel className="mb-4 border-red-200 bg-red-50">
        <h2 className="font-semibold text-red-900">Reserva anulada</h2>
        <p className="mt-1 text-sm text-red-800">
          {cancellationReason ? `Motivo: ${cancellationReason}` : "Anulada."}
          {latest?.status === "approved" && latest.decider ? ` · Aprobada por ${latest.decider}${latest.decided_at ? ` el ${when(latest.decided_at)}` : ""}` : ""}
        </p>
        {paymentsRetained ? (
          <p className="mt-1 text-sm font-semibold text-red-900">
            {totalPaid > 0 ? `Pagos retenidos: ${clp(totalPaid)} cuentan como ingreso.` : "Pagos devueltos al huésped: la devolución quedó registrada."}
          </p>
        ) : (
          totalPaid > 0 && (
            <>
              <p className="mt-1 text-sm font-semibold text-red-900">
                Tiene {clp(totalPaid)} en pagos sin resolver: no cuentan como ingreso hasta que se decida qué hacer con ellos.
              </p>
              {canSettlePayments && (
                <form action={settleCancelledPaymentsAction} className="mt-3 space-y-2">
                  <input type="hidden" name="reservation_id" value={reservationId} />
                  <PaymentsDecision candidates={moveCandidates} canVoidPayments={canVoidPayments} />
                  <input name="note" required minLength={3} maxLength={300} placeholder="Nota (ej.: transferencia repetida, devuelta el 05-11)" className={`${field} bg-white`} />
                  <ConfirmButton message="¿Resolver los pagos de esta reserva anulada?" className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">
                    Resolver pagos
                  </ConfirmButton>
                </form>
              )}
            </>
          )
        )}
      </Panel>
    );

  if (pending)
    return (
      <Panel className="mb-4 border-amber-300 bg-amber-50">
        <h2 className="font-semibold text-amber-900">Anulación pendiente de aprobación</h2>
        <p className="mt-1 text-sm text-amber-900">
          Solicitada por {pending.requester ?? "recepción"} el {when(pending.requested_at)}. Motivo: {pending.reason}
        </p>
        {pending.paid_amount > 0 && (
          <p className="mt-1 text-sm font-semibold text-amber-900">
            El huésped tiene {clp(pending.paid_amount)} pagados.
            {pending.payments_action ? ` Al aprobar: ${paymentsActionLabel[pending.payments_action].toLowerCase()}.` : ""}
          </p>
        )}
        {canApprove ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <form action={decideReservationCancellationAction}>
              <input type="hidden" name="request_id" value={pending.id} />
              <input type="hidden" name="reservation_id" value={reservationId} />
              <input type="hidden" name="decision" value="approve" />
              {totalPaid > 0 && !pending.payments_action && (
                <div className="mb-2">
                  <PaymentsDecision candidates={moveCandidates} canVoidPayments />
                </div>
              )}
              <input name="notes" maxLength={500} placeholder="Comentario (opcional)" className={`${field} mb-2 bg-white`} />
              <ConfirmButton message="¿Aprobar la anulación? La reserva quedará anulada y la fecha se libera." className="w-full rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">
                Aprobar anulación
              </ConfirmButton>
            </form>
            <form action={decideReservationCancellationAction}>
              <input type="hidden" name="request_id" value={pending.id} />
              <input type="hidden" name="reservation_id" value={reservationId} />
              <input type="hidden" name="decision" value="reject" />
              <input name="notes" required minLength={3} maxLength={500} placeholder="Motivo del rechazo" className={`${field} mb-2 bg-white`} />
              <button className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Rechazar</button>
            </form>
          </div>
        ) : (
          <p className="mt-2 text-xs text-amber-800">La reserva sigue vigente hasta que el administrador la apruebe.</p>
        )}
      </Panel>
    );

  if (!cancellable || !(canRequest || canApprove)) return null;
  return (
    <details className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-red-700">{immediate ? "Anular reserva" : "Solicitar anulación"}</summary>
      {latest?.status === "rejected" && (
        <p className="mt-2 text-xs text-slate-500">
          Última solicitud rechazada{latest.decider ? ` por ${latest.decider}` : ""}: {latest.decision_notes}
        </p>
      )}
      <form action={requestReservationCancellationAction} className="mt-3 space-y-2">
        <input type="hidden" name="reservation_id" value={reservationId} />
        <textarea name="reason" required minLength={5} maxLength={500} rows={2} placeholder="Motivo (ej.: el huésped canceló por teléfono)" className={field} />
        {totalPaid > 0 && (
          <>
            <p className="text-xs font-semibold text-amber-800">Tiene {clp(totalPaid)} pagados.</p>
            <PaymentsDecision candidates={moveCandidates} canVoidPayments={canVoidPayments} />
          </>
        )}
        <p className="text-xs text-slate-500">
          {canApprove
            ? "Como administrador, la reserva queda anulada de inmediato. No se borra: queda registrada con el motivo."
            : startsTodayOrLater
              ? "La reserva es de hoy o posterior: queda anulada de inmediato. No se borra: queda registrada con el motivo."
              : "La reserva empezó en un día anterior: la solicitud pasa al administrador para su aprobación. Mientras tanto sigue vigente."}
        </p>
        <ConfirmButton
          message={immediate ? "¿Anular esta reserva?" : "¿Enviar la solicitud de anulación?"}
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
        >
          {immediate ? "Anular reserva" : "Enviar solicitud"}
        </ConfirmButton>
      </form>
    </details>
  );
}
