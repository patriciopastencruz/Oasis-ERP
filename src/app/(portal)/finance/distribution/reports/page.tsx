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
  periodDistributionData,
  type DistributionDailySales,
} from "@/modules/finance/distribution/application/queries";

const number = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function mondayOf(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}
function monthBounds(date: string, monthOffset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + monthOffset;
  const first = new Date(Date.UTC(year, month, 1, 12));
  const last = new Date(Date.UTC(year, month + 1, 0, 12));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Panel className="p-3">
      <p className="text-[10px] font-semibold uppercase leading-3 text-[#63778e]">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-bold leading-5">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-[#909fb1]">{hint}</p>}
    </Panel>
  );
}

function PeriodSalesChart({ daily }: { daily: DistributionDailySales[] }) {
  const max = Math.max(...daily.map((d) => d.sales), 1);
  const chartHeight = 140;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-fit items-end gap-2">
        {daily.map((d) => {
          const barHeight = Math.max(
            3,
            Math.round((d.sales / max) * chartHeight),
          );
          return (
            <div
              key={d.date}
              className="flex w-12 shrink-0 flex-col items-center gap-1"
            >
              <span className="text-center text-[10px] font-semibold leading-tight text-[#083f7d]">
                {d.sales > 0 ? clp.format(d.sales) : ""}
              </span>
              <div
                className="flex items-end"
                style={{ height: chartHeight }}
              >
                <div
                  className="w-7 rounded-t bg-[var(--oasis-primary)]"
                  style={{ height: barHeight }}
                />
              </div>
              <span className="text-[10px] text-[#63778e]">
                {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  const periodFrom = q.from ?? mondayOf(date);
  const periodTo = q.to ?? addDays(periodFrom, 6);
  const [weekFrom, weekTo] = [mondayOf(date), addDays(mondayOf(date), 6)];
  const [monthFrom, monthTo] = monthBounds(date, 0);
  const [prevMonthFrom, prevMonthTo] = monthBounds(date, -1);
  let period = null;
  let periodError = "";
  try {
    period = (await periodDistributionData(periodFrom, periodTo)).summary;
  } catch (error) {
    periodError =
      error instanceof Error ? error.message : "No se pudo consultar el período.";
  }

  return (
    <>
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--oasis-accent)]">
          Distribuidora Altiplánica
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
          Cierre diario y reportes
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-5 text-[#5c6f85]">
          Elige qué quieres revisar: el cierre de un día puntual o un
          resumen agregado por período.
        </p>
      </header>
      <Flash success={q.success} error={q.error} />

      <details className="group mb-4 overflow-hidden rounded-2xl border border-[var(--oasis-border)] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-[var(--oasis-primary)] [&::-webkit-details-marker]:hidden">
          <span>Cierre diario</span>
          <span className="text-xs font-normal text-[#5b6d82] group-open:hidden">
            Control operativo, productos, ventas, cobros y gastos de la
            jornada
          </span>
        </summary>
        <div className="space-y-4 border-t border-[#dee4ea] p-4">
          <div className="w-full rounded-2xl border border-[#d9dfe6] bg-white p-2.5 shadow-[0_8px_24px_rgba(20,57,39,.04)] lg:w-fit">
            <form className="flex flex-wrap items-end gap-2">
              <label className="min-w-44 flex-1 text-[10px] font-semibold uppercase tracking-wide text-[#56677b] lg:flex-none">
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
              <Link
                href={`/api/finance/distribution/reports.pdf?date=${date}`}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                Exportar a PDF
              </Link>
            </form>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {operational.map(([label, value, Icon]) => (
              <Panel key={label} className="flex items-center gap-2 p-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--oasis-primary)_10%,white)] text-[var(--oasis-primary)]">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase leading-3 text-[#63778e]">
                    {label}
                  </p>
                  <p className="text-lg font-bold leading-5">{value}</p>
                </div>
              </Panel>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,.7fr)]">
            <Panel className="overflow-hidden p-0">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold">Detalle por producto</h2>
                <p className="text-xs text-[#63778e]">
                  Cantidades planificadas y efectivamente entregadas, con su
                  venta en pesos chilenos.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-sm">
                  <thead className="bg-[#f2f5f8] text-left text-xs uppercase text-[#56677b]">
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
                          <span className="ml-2 font-mono text-xs font-normal text-[#63778e]">
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
                        <td
                          colSpan={5}
                          className="p-8 text-center text-[#63778e]"
                        >
                          No hay productos asociados a pedidos de esta fecha.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-[#f7f9fb] font-bold">
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
                      <dt className="text-[#56677b]">{label}</dt>
                      <dd className="font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel>
                <h2 className="mb-3 font-semibold">
                  Declaración de caja de choferes
                </h2>
                {summary.driver_closures?.length ? (
                  <div className="space-y-3">
                    {summary.driver_closures.map((dc) => (
                      <div
                        key={dc.driver_id}
                        className="rounded-xl border border-[#d9dfe6] p-3 text-sm"
                      >
                        <p className="font-semibold">{dc.driver_name}</p>
                        <div className="mt-1 flex justify-between text-[#56677b]">
                          <span>Efectivo declarado</span>
                          <b className="text-[#083f7d]">
                            {clp.format(dc.declared_cash)}
                          </b>
                        </div>
                        <div className="flex justify-between text-[#56677b]">
                          <span>Pendiente de pago</span>
                          <b className="text-[#083f7d]">
                            {clp.format(dc.pending_amount)}
                          </b>
                        </div>
                        {dc.observations && (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-[#63778e]">
                            {dc.observations}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#63778e]">
                    Ningún chofer ha declarado su cierre de caja para este
                    día.
                  </p>
                )}
              </Panel>

              <Panel>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Cierre formal</h2>
                    <p className="mt-1 text-xs text-[#63778e]">
                      Guarda un snapshot auditable y bloquea modificaciones
                      normales del {date}.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${isClosed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {isClosed ? "Cerrado" : "Abierto"}
                  </span>
                </div>
                {isClosed ? (
                  <div className="mt-4 rounded-xl bg-[#f2f5f8] p-3 text-sm">
                    <p className="text-xs font-semibold uppercase text-[#63778e]">
                      Observaciones
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {d.closure?.observations ||
                        "Sin observaciones registradas."}
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
                  <p className="mt-4 text-sm text-[#63778e]">
                    No tienes permiso para cerrar esta jornada.
                  </p>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </details>

      <details className="group overflow-hidden rounded-2xl border border-[var(--oasis-border)] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-[var(--oasis-primary)] [&::-webkit-details-marker]:hidden">
          <span>Reporte por período</span>
          <span className="text-xs font-normal text-[#5b6d82] group-open:hidden">
            Ventas, kilos y créditos agregados por semana, mes, etc.
          </span>
        </summary>
        <div className="space-y-4 border-t border-[#dee4ea] p-4">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <Link
              href={`?date=${date}&from=${weekFrom}&to=${weekTo}`}
              className="rounded-lg border px-3 py-1.5"
            >
              Esta semana
            </Link>
            <Link
              href={`?date=${date}&from=${monthFrom}&to=${monthTo}`}
              className="rounded-lg border px-3 py-1.5"
            >
              Este mes
            </Link>
            <Link
              href={`?date=${date}&from=${prevMonthFrom}&to=${prevMonthTo}`}
              className="rounded-lg border px-3 py-1.5"
            >
              Mes anterior
            </Link>
          </div>
          <Panel>
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="date" value={date} />
              <label className="min-w-40 flex-1 text-[10px] font-semibold uppercase tracking-wide text-[#56677b] lg:flex-none">
                Desde
                <input
                  className={`${inputClass} mt-1 rounded-lg py-2 text-sm`}
                  type="date"
                  name="from"
                  defaultValue={periodFrom}
                />
              </label>
              <label className="min-w-40 flex-1 text-[10px] font-semibold uppercase tracking-wide text-[#56677b] lg:flex-none">
                Hasta
                <input
                  className={`${inputClass} mt-1 rounded-lg py-2 text-sm`}
                  type="date"
                  name="to"
                  defaultValue={periodTo}
                />
              </label>
              <button className={`${buttonClass} rounded-lg px-4 py-2 text-sm`}>
                Consultar
              </button>
              <Link
                href={`/api/finance/distribution/period-report.pdf?from=${periodFrom}&to=${periodTo}`}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                Exportar a PDF
              </Link>
            </form>
          </Panel>
          {periodError ? (
            <Panel className="text-sm text-red-700">{periodError}</Panel>
          ) : (
            period && (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Kpi
                    label="Ventas totales del período"
                    value={clp.format(period.delivered_sales)}
                  />
                  <Kpi
                    label="Kilos vendidos"
                    value={`${number.format(period.total_kg)} kg`}
                  />
                  <Kpi
                    label="Cantidad de productos"
                    value={number.format(period.total_units)}
                  />
                  <Kpi
                    label="Créditos pendientes de cobro"
                    value={clp.format(period.outstanding_credit)}
                    hint="Saldo vigente hoy, no solo del período"
                  />
                  <Kpi
                    label="Venta promedio de kilos/día"
                    value={`${number.format(period.total_kg / period.days)} kg`}
                  />
                  <Kpi
                    label="Venta promedio total/día"
                    value={clp.format(period.delivered_sales / period.days)}
                  />
                </div>
                <Panel>
                  <h3 className="mb-3 font-semibold">Ventas por día</h3>
                  <PeriodSalesChart daily={period.daily} />
                </Panel>
              </>
            )
          )}
        </div>
      </details>
    </>
  );
}
