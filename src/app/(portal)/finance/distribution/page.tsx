/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { uiLabel } from "@/lib/ui-labels";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageX,
  Truck,
  WalletCards,
} from "lucide-react";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { Panel } from "@/components/ui/page";
import {
  assignOrderAction,
  requestOrderChangeAction,
} from "@/modules/finance/distribution/application/actions";
import {
  clp,
  dailyDistributionData,
} from "@/modules/finance/distribution/application/queries";

export default async function DistributionOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const date =
    query.date ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const data = await dailyDistributionData(date);
  if (data.ctx.permissions.has("finance.distribution.driver"))
    redirect(`/finance/distribution/driver?date=${date}`);
  const previous = new Date(`${date}T12:00:00`);
  previous.setDate(previous.getDate() - 1);
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const cards = [
    ["Pedidos", data.summary.orders_total ?? 0, CalendarDays, "text-blue-600"],
    [
      "Entregados",
      data.summary.delivered ?? 0,
      CheckCircle2,
      "text-emerald-600",
    ],
    ["Pendientes", data.summary.pending ?? 0, Clock3, "text-amber-600"],
    [
      "No entregados",
      data.summary.not_delivered ?? 0,
      PackageX,
      "text-red-600",
    ],
    ["Sin chofer", data.summary.unassigned ?? 0, Truck, "text-violet-600"],
    [
      "Venta planificada",
      clp.format(data.summary.planned_sales ?? 0),
      WalletCards,
      "text-[var(--oasis-primary)]",
    ],
  ] as const;
  return (
    <>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--oasis-accent)]">
            Distribuidora Altiplánica
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
            <p className="text-xs text-[#69786f]">
              Planificación diaria, reparto, entrega y cobranza.
            </p>
          </div>
        </div>
      </header>
      <Flash success={query.success} error={query.error} />
      <Panel className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded-lg border px-3 py-2 text-xs font-medium"
            href={`/finance/distribution?date=${previous.toLocaleDateString("en-CA")}`}
          >
            ← Día anterior
          </Link>
          <form className="flex items-center gap-2">
            <label className="sr-only" htmlFor="distribution-date">
              Fecha de planificación
            </label>
            <div className="w-40">
              <input
                id="distribution-date"
                className={`${inputClass} rounded-lg py-2 text-xs`}
                type="date"
                name="date"
                defaultValue={date}
              />
            </div>
            <button className={`${buttonClass} rounded-lg px-3 py-2 text-xs`}>
              Ir
            </button>
          </form>
          <Link
            className="rounded-lg border px-3 py-2 text-xs font-medium"
            href={`/finance/distribution?date=${next.toLocaleDateString("en-CA")}`}
          >
            Día siguiente →
          </Link>
          <Link
            className={`${buttonClass} ml-auto rounded-lg px-3 py-2 text-xs`}
            href={`/finance/distribution/orders/new?date=${date}`}
          >
            + Nuevo pedido
          </Link>
        </div>
      </Panel>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, Icon, color]) => (
          <Panel key={label} className="flex items-center gap-2.5 p-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f3f7f5]">
              <Icon className={color} size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase leading-3 text-[#68786e]">
                {label}
              </p>
              <p className="mt-0.5 truncate text-lg font-bold leading-5">
                {value}
              </p>
            </div>
          </Panel>
        ))}
      </div>
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="bg-[var(--oasis-sidebar)] text-white">
              <tr>
                {[
                  "Orden",
                  "Nº pedido",
                  "Hora",
                  "Cliente",
                  "Dirección",
                  "Productos",
                  "Total",
                  "Pago",
                  "Chofer",
                  "Estado",
                  "Acciones",
                ].map((x) => (
                  <th key={x} className="px-3 py-3 text-xs">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o: any) => (
                <tr key={o.id} className="border-b border-[#e4ebe7]">
                  <td className="px-3 py-3 font-bold">
                    {o.route_position ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {o.order_number}
                    {o.route_sale && (
                      <span className="mt-1 block w-fit rounded-full bg-violet-100 px-2 py-0.5 font-sans text-[10px] font-semibold text-violet-800">
                        Venta en ruta
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {o.estimated_time?.slice(0, 5) ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {o.dist_customers?.name ?? o.occasional_customer_name}
                  </td>
                  <td className="max-w-48 px-3 py-3">{o.delivery_address}</td>
                  <td className="px-3 py-3">
                    {o.dist_order_lines.map((l: any) => (
                      <span
                        key={l.id}
                        className="mr-1 inline-block rounded bg-blue-50 px-2 py-1 text-xs text-blue-800"
                      >
                        {l.dist_products?.name} ×{l.planned_quantity}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {clp.format(Number(o.total))}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs">
                      {uiLabel(o.payment_status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {o.driver_id ? (
                      data.drivers.find((d: any) => d.id === o.driver_id)
                        ?.first_name
                    ) : (
                      <form action={assignOrderAction} className="flex gap-1">
                        <input type="hidden" name="order_id" value={o.id} />
                        <select
                          name="driver_id"
                          className="rounded border p-1"
                          required
                        >
                          <option value="">Asignar</option>
                          {data.drivers.map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.first_name} {d.last_name}
                            </option>
                          ))}
                        </select>
                        <button className="rounded bg-[var(--oasis-primary)] px-2 text-white">
                          ✓
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {uiLabel(o.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {data.ctx.permissions.has(
                      "finance.distribution.requests.create",
                    ) && (
                      <form
                        action={requestOrderChangeAction}
                        className="flex gap-1"
                      >
                        <input type="hidden" name="order_id" value={o.id} />
                        <input type="hidden" name="type" value="void" />
                        <input
                          className="w-28 rounded border p-1 text-xs"
                          name="reason"
                          placeholder="Motivo"
                          required
                        />
                        <button className="text-xs text-red-700">
                          Solicitar anulación
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.orders.length && (
            <p className="p-10 text-center text-sm text-[#6d7c73]">
              No hay pedidos para esta fecha.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
