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
 * No-show: la persona no llegó y no hay pago asociado (toda reserva debe
 * cargarse con su pago y comprobante). Se anula: libera la habitación y no
 * cuenta en ocupación ni en venta. Si la reserva sí tiene pagos, se deja tal
 * cual (se asume ocupada) y, si la habitación se revende, ambas cuentan.
 */
export function ReservationNoShow({
  reservationId,
  status,
  noShow,
  noShowAt,
  totalPaid,
  startsOnOrBeforeToday,
  canMark,
  canUnmark,
}: {
  reservationId: string;
  status: string;
  noShow: boolean;
  noShowAt: string | null;
  totalPaid: number;
  startsOnOrBeforeToday: boolean;
  canMark: boolean;
  canUnmark: boolean;
}) {
  if (noShow)
    return (
      <Panel className="mb-4 border-slate-200 bg-slate-50">
        <h2 className="font-semibold text-slate-800">No-show · sin pago</h2>
        <p className="mt-1 text-sm text-slate-600">
          La persona no se presentó y no había pago asociado. La habitación quedó libre y esta reserva no cuenta en ocupación ni en venta.
          {noShowAt ? ` Marcado el ${when(noShowAt)}.` : ""}
        </p>
        {canUnmark && (
          <form action={unmarkNoShowAction} className="mt-3">
            <input type="hidden" name="reservation_id" value={reservationId} />
            <ConfirmButton
              message="¿Quitar la marca de no-show? La reserva quedará como una anulación normal."
              className="text-sm font-semibold text-slate-700 underline"
            >
              Quitar marca (dejar como anulación normal)
            </ConfirmButton>
          </form>
        )}
      </Panel>
    );

  if (!canMark || !["pending", "confirmed"].includes(status) || !startsOnOrBeforeToday)
    return null;

  if (totalPaid > 0)
    return (
      <Panel className="mb-4 border-blue-200 bg-blue-50">
        <h2 className="font-semibold text-blue-900">Reserva con pago ({clp(totalPaid)})</h2>
        <p className="mt-1 text-sm text-blue-800">
          Si la persona no llega, no se marca no-show: la reserva queda registrada y se asume ocupada y pagada.
          Si la habitación se vuelve a vender, ambas reservas cuentan en la ocupación y en la venta.
        </p>
      </Panel>
    );

  return (
    <Panel className="mb-4">
      <h2 className="font-semibold">¿La persona no llegó?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Esta reserva no tiene pagos. Si no se presentó, márcala como <b>no-show</b>: libera la habitación
        y no cuenta en ocupación ni en venta.
      </p>
      <form action={markNoShowAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="reservation_id" value={reservationId} />
        <label className="min-w-64 flex-1 text-sm">
          Observación (opcional)
          <input
            name="note"
            maxLength={300}
            placeholder="Ej. No contestó el teléfono"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <ConfirmButton
          message="¿Marcar como no-show? La reserva quedará anulada y la habitación libre."
          className="rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Marcar no-show
        </ConfirmButton>
      </form>
    </Panel>
  );
}
