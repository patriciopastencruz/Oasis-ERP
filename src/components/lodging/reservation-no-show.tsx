import { Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import {
  markNoShowAction,
  unmarkNoShowAction,
} from "@/modules/lodging/application/actions";

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
const when = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/**
 * No-show con pago retenido: la persona pagó, avisó que no llegaba y por
 * política no se reembolsa. Se libera la habitación para venderla de nuevo,
 * pero esta noche sigue contando como ocupada y su monto se suma en los reportes.
 */
export function ReservationNoShow({
  reservationId,
  status,
  retained,
  retainedAt,
  totalPaid,
  totalValue,
  startsOnOrBeforeToday,
  canMark,
  canUnmark,
}: {
  reservationId: string;
  status: string;
  retained: boolean;
  retainedAt: string | null;
  totalPaid: number;
  totalValue: number;
  startsOnOrBeforeToday: boolean;
  canMark: boolean;
  canUnmark: boolean;
}) {
  if (retained)
    return (
      <Panel className="mb-4 border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-900">No-show · pago retenido</h2>
        <p className="mt-1 text-sm text-amber-800">
          La habitación quedó libre. Esta noche cuenta como ocupada y su monto se suma en los
          indicadores (la ocupación del día puede superar el 100%).
          {retainedAt ? ` Marcado el ${when(retainedAt)}.` : ""}
        </p>
        {canUnmark && (
          <form action={unmarkNoShowAction} className="mt-3">
            <input type="hidden" name="reservation_id" value={reservationId} />
            <ConfirmButton
              message="¿Quitar la retención? La reserva quedará como una anulación normal y dejará de contar en ocupación y venta."
              className="text-sm font-semibold text-amber-900 underline"
            >
              Quitar retención (dejar como anulación normal)
            </ConfirmButton>
          </form>
        )}
      </Panel>
    );

  if (!canMark || !["pending", "confirmed"].includes(status) || !startsOnOrBeforeToday)
    return null;

  return (
    <Panel className="mb-4">
      <h2 className="font-semibold">¿La persona no llegó?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Si pagó, avisó que no llegaba y no se reembolsa, márcalo como <b>no-show</b>: la habitación
        queda libre para venderla de nuevo y esta noche sigue contando como ocupada, con su monto
        ({totalPaid > 0 ? `pagado ${clp(totalPaid)}` : `reserva de ${clp(totalValue)}`}).
      </p>
      <form action={markNoShowAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="reservation_id" value={reservationId} />
        <label className="min-w-64 flex-1 text-sm">
          Motivo
          <input
            name="note"
            required
            minLength={5}
            maxLength={300}
            placeholder="Ej. Avisó hoy que no llegaría; no hay reembolso"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <ConfirmButton
          message="¿Marcar como no-show con pago retenido? La habitación quedará libre y la noche contará como ocupada con su monto."
          className="rounded-xl border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
        >
          Marcar no-show
        </ConfirmButton>
      </form>
    </Panel>
  );
}
