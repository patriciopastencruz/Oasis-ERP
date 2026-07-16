import Link from "next/link";
import {
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  PackageX,
  ShoppingCart,
  Truck,
} from "lucide-react";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { Panel } from "@/components/ui/page";
import { closeDayAction } from "@/modules/finance/distribution/application/actions";
import {
  clp,
  dailyDistributionData,
} from "@/modules/finance/distribution/application/queries";

const number = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const date =
    q.date ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const d = await dailyDistributionData(
    date,
    "finance.distribution.reports.view",
  );
  const summary = d.summary;
  const operational = [
    ["Pedidos del día", summary.orders_total ?? 0, ShoppingCart],
    ["Entregados", summary.delivered ?? 0, CheckCircle2],
    ["Entregas parciales", summary.partial ?? 0, ClipboardCheck],
    ["Pendientes", summary.pending ?? 0, Clock3],
    ["No entregados", summary.not_delivered ?? 0, PackageX],
    ["Sin chofer", summary.unassigned ?? 0, Truck],
    ["Ventas en ruta", summary.route_sales ?? 0, CircleDollarSign],
    ["Cumplimiento", `${summary.delivery_rate ?? 0}%`, CheckCircle2],
  ] as const;
  const financial = [
    ["Venta total del día", clp.format(summary.planned_sales ?? 0)],
    ["Venta entregada", clp.format(summary.delivered_sales ?? 0)],
    ["Efectivo recibido", clp.format(summary.cash_received ?? 0)],
    ["Transferencia recibida", clp.format(summary.transfer_received ?? 0)],
    ["Pago mixto recibido", clp.format(summary.mixed_received ?? 0)],
    ["Monto vendido a crédito", clp.format(summary.credit ?? 0)],
    ["Total recibido", clp.format(summary.total_received ?? 0)],
    ["Gastos del día", clp.format(summary.expense_total ?? 0)],
  ] as const;
  const productRows = summary.product_details ?? [];
  const isClosed = d.closure?.status === "closed";

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--oasis-accent)]">
            Distribuidora Altiplánica
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
            Cierre diario y reportes
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-5 text-[#69786f]">
            Control operativo, productos, ventas, cobros y gastos de la jornada;
            excluye pedidos anulados.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-[#dce4df] bg-white p-2.5 shadow-[0_8px_24px_rgba(20,57,39,.04)] lg:w-auto">
          <form className="flex flex-wrap items-end gap-2">
            <label className="min-w-44 flex-1 text-[10px] font-semibold uppercase tracking-wide text-[#607168] lg:flex-none">
              Fecha
              <input
                className={`${inputClass} mt-1 rounded-lg py-2 text-sm`}
                type="date"
                name="date"
                defaultValue={date}
              />
            </label>
            <button className={`${buttonClass} rounded-lg px-4 py-2 text-sm`}>
              Consultar
            </button>
            <Link
              href={`/api/finance/distribution/reports.xlsx?date=${date}`}
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              Exportar a Excel
            </Link>
          </form>
        </div>
      </header>
      <Flash success={q.success} error={q.error} />

      <section className="mb-4">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Control de entregas</h2>
            <p className="text-xs text-[#718078]">
              Indicadores para controlar el avance y las excepciones del día.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {operational.map(([label, value, Icon]) => (
            <Panel key={label} className="flex items-center gap-2 p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--oasis-primary)_10%,white)] text-[var(--oasis-primary)]">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase leading-3 text-[#718078]">
                  {label}
                </p>
                <p className="text-lg font-bold leading-5">{value}</p>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,.7fr)]">
        <Panel className="overflow-hidden p-0">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Detalle por producto</h2>
            <p className="text-xs text-[#718078]">
              Cantidades planificadas y efectivamente entregadas, con su venta
              en pesos chilenos.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="bg-[#f3f7f5] text-left text-xs uppercase text-[#607168]">
                <tr>
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-3 py-3">Presentación</th>
                  <th className="px-3 py-3 text-right">Planificado</th>
                  <th className="px-3 py-3 text-right">Entregado</th>
                  <th className="px-5 py-3 text-right">Venta producto</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((product) => (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="px-5 py-3 font-semibold">
                      {product.name}
                      <span className="ml-2 font-mono text-xs font-normal text-[#718078]">
                        {product.code}
                      </span>
                    </td>
                    <td className="px-3 py-3">{product.presentation}</td>
                    <td className="px-3 py-3 text-right">
                      {number.format(product.planned_quantity)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {number.format(product.delivered_quantity)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {clp.format(product.delivered_sales)}
                    </td>
                  </tr>
                ))}
                {productRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[#718078]">
                      No hay productos asociados a pedidos de esta fecha.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-[#f8faf9] font-bold">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-right">
                    Venta total entregada
                  </td>
                  <td className="px-5 py-3 text-right">
                    {clp.format(summary.delivered_sales ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="mb-3 font-semibold">Resumen financiero</h2>
            <dl className="divide-y text-sm">
              {financial.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <dt className="text-[#607168]">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel>
            <h2 className="mb-3 font-semibold">Declaración de caja de choferes</h2>
            {summary.driver_closures?.length ? (
              <div className="space-y-3">
                {summary.driver_closures.map((d) => (
                  <div
                    key={d.driver_id}
                    className="rounded-xl border border-[#dce4df] p-3 text-sm"
                  >
                    <p className="font-semibold">{d.driver_name}</p>
                    <div className="mt-1 flex justify-between text-[#607168]">
                      <span>Efectivo declarado</span>
                      <b className="text-[#173f2d]">
                        {clp.format(d.declared_cash)}
                      </b>
                    </div>
                    <div className="flex justify-between text-[#607168]">
                      <span>Pendiente de pago</span>
                      <b className="text-[#173f2d]">
                        {clp.format(d.pending_amount)}
                      </b>
                    </div>
                    {d.observations && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-[#718078]">
                        {d.observations}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#718078]">
                Ningún chofer ha declarado su cierre de caja para este día.
              </p>
            )}
          </Panel>

          <Panel>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Cierre formal</h2>
                <p className="mt-1 text-xs text-[#718078]">
                  Guarda un snapshot auditable y bloquea modificaciones normales
                  del {date}.
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${isClosed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
              >
                {isClosed ? "Cerrado" : "Abierto"}
              </span>
            </div>
            {isClosed ? (
              <div className="mt-4 rounded-xl bg-[#f3f7f5] p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-[#718078]">
                  Observaciones
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {d.closure?.observations || "Sin observaciones registradas."}
                </p>
              </div>
            ) : d.ctx.permissions.has(
                "finance.distribution.closures.manage",
              ) ? (
              <form action={closeDayAction} className="mt-4">
                <input type="hidden" name="date" value={date} />
                <label className="text-sm">
                  Observaciones del día
                  <textarea
                    className={`${inputClass} min-h-24 resize-y`}
                    name="observations"
                    maxLength={1500}
                    placeholder="Temas pendientes, detalle de gastos o incidencias de entrega."
                  />
                </label>
                <button className={`${buttonClass} mt-3 w-full`}>
                  Cerrar jornada
                </button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-[#718078]">
                No tienes permiso para cerrar esta jornada.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
