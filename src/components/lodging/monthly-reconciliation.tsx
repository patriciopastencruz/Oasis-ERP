import Link from "next/link";
import { Panel } from "@/components/ui/page";
import { clp } from "@/modules/lodging/domain/daily-closing";
import type { MonthlySummary } from "@/modules/lodging/domain/monthly-closing";

const methodLabel: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  airbnb: "Airbnb",
  booking: "Booking",
  company: "Empresa",
  other: "Otro",
};
const dm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

/**
 * Referencia bajo el estado de resultados: los pagos contabilizados en el mes contra la venta por noches,
 * las reservas del mes cuyo monto no coincide con lo pagado y los pagos que quedaron en reservas anuladas.
 */
export function MonthlyReconciliation({ summary }: { summary: MonthlySummary }) {
  if (!summary.sales || !summary.reconciliation) return null;
  const sales = Number(summary.sales.total);
  const paid = Number(summary.lodging_income.total);
  const diff = sales - paid;
  const { mismatches, cancelled_payments: cancelled } = summary.reconciliation;
  const methods = Object.entries(summary.lodging_income.by_method ?? {}).filter(([, v]) => Number(v) !== 0);

  return (
    <Panel className="min-w-0">
      <h2 className="font-semibold">Conciliación con pagos</h2>
      <p className="mt-1 text-xs text-slate-500">
        Referencia: no se suma al estado de resultados. Los pagos se cuentan por la fecha en que se registraron.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">Venta de noches del mes</dt>
          <dd className="font-semibold tabular-nums">{clp(sales)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">Pagos contabilizados en el mes</dt>
          <dd className="font-semibold tabular-nums">{clp(paid)}</dd>
          {methods.length > 0 && (
            <dd className="mt-1 text-[11px] text-slate-500">
              {methods.map(([k, v]) => `${methodLabel[k] ?? k} ${clp(Number(v))}`).join(" · ")}
            </dd>
          )}
        </div>
        <div className={`rounded-xl p-3 ${diff === 0 ? "bg-emerald-50" : "bg-amber-50"}`}>
          <dt className="text-xs text-slate-500">Diferencia</dt>
          <dd className={`font-semibold tabular-nums ${diff === 0 ? "text-emerald-700" : "text-amber-800"}`}>
            {diff === 0 ? "Coinciden" : clp(diff)}
          </dd>
        </div>
      </dl>
      {diff !== 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Parte de la diferencia es normal: abonos de estadías de otro mes y estadías que cruzan el cambio de mes. Lo que hay
          que revisar son las reservas de abajo.
        </p>
      )}

      {cancelled.count > 0 && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {cancelled.count === 1 ? "Hay 1 pago" : `Hay ${cancelled.count} pagos`} del mes por {clp(Number(cancelled.amount))} en
          reservas anuladas. No cuentan: si el dinero se recibió, regístralo en la reserva vigente; si está repetido, anúlalo.
        </p>
      )}

      <h3 className="mt-4 text-sm font-semibold">
        Reservas del mes cuyo monto no coincide con lo pagado{" "}
        <span className="font-normal text-slate-500">({mismatches.length})</span>
      </h3>
      {mismatches.length === 0 ? (
        <p className="mt-1 text-sm text-emerald-700">Todas las reservas del mes están pagadas por su monto exacto.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1.5">Habitación</th>
                <th>Huésped</th>
                <th>Estadía</th>
                <th className="text-right">Monto</th>
                <th className="text-right">Pagado</th>
                <th className="text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1.5">
                    <Link href={`/lodging/reservations/${m.id}`} className="font-semibold text-[#0b4f9c] hover:underline">
                      {m.room}
                    </Link>
                  </td>
                  <td>
                    {m.guest ?? "—"}
                    {m.postpaid_company && <span className="ml-1 text-[11px] text-slate-500">(paga empresa)</span>}
                  </td>
                  <td className="tabular-nums">
                    {dm(m.check_in)} al {dm(m.check_out)}
                  </td>
                  <td className="text-right tabular-nums">{clp(Number(m.total_value))}</td>
                  <td className="text-right tabular-nums">{clp(Number(m.paid))}</td>
                  <td className={`text-right font-semibold tabular-nums ${Number(m.difference) > 0 ? "text-amber-800" : "text-red-700"}`}>
                    {Number(m.difference) > 0 ? `Falta ${clp(Number(m.difference))}` : `Sobra ${clp(-Number(m.difference))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
