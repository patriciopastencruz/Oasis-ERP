/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { uiLabel } from "@/lib/ui-labels";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
  reorderOrderAction,
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
  if (data.ctx.role?.key === "driver")
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
      "Venta del día",
      clp.format(data.summary.planned_sales ?? 0),
      WalletCards,
      "text-[var(--oasis-primary)]",
    ],
  ] as const;
  const voidedStatuses = ["cancelled", "voided"];
  const activeOrders = data.orders.filter(
    (o: any) => !voidedStatuses.includes(o.status),
  );
  const voidedOrders = data.orders.filter((o: any) =>
    voidedStatuses.includes(o.status),
  );
  const canManageRoutes = data.ctx.permissions.has(
    "finance.distribution.routes.manage",
  );
  const routeBounds = new Map<string, { first: string; last: string }>();
  for (const driverId of new Set(
    activeOrders.filter((o: any) => o.driver_id).map((o: any) => o.driver_id),
  )) {
    const route = activeOrders
      .filter((o: any) => o.driver_id === driverId)
      .sort(
        (a: any, b: any) => (a.route_position ?? 0) - (b.route_position ?? 0),
      );
    routeBounds.set(driverId as string, {
      first: route[0]?.id,
      last: route[route.length - 1]?.id,
    });
  }
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
      {voidedOrders.length > 0 && (
        <details className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900">
          <summary className="cursor-pointer select-none p-4 text-sm font-semibold marker:text-amber-700">
            {voidedOrders.length}{" "}
            {voidedOrders.length === 1
              ? "pedido anulado este día"
              : "pedidos anulados este día"}
            <span className="ml-2 text-xs font-normal text-amber-700">
              (clic para ver el detalle)
            </span>
          </summary>
          <div className="space-y-3 border-t border-amber-200 p-4 pt-3">
            {voidedOrders.map((o: any) => (
              <div
                key={o.id}
                className="rounded-xl border border-amber-100 bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    className="font-mono text-xs font-semibold text-[var(--oasis-primary)] underline"
                    href={`/finance/distribution/orders/${o.id}`}
                  >
                    {o.order_number}
                  </Link>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                    {uiLabel(o.status)}
                  </span>
                  {o.voided_at && (
                    <span className="text-xs text-[#6d7c73]">
                      Anulado el{" "}
                      {new Date(o.voided_at).toLocaleString("es-CL", {
                        timeZone: "America/Santiago",
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-2 font-semibold">
                  {o.dist_customers?.name ?? o.occasional_customer_name}
                </p>
                <p className="text-xs text-[#6d7c73]">
                  {o.delivery_address}
                  {o.customer_phone ? ` · ${o.customer_phone}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {o.dist_order_lines.map((l: any) => (
                    <span
                      key={l.id}
                      className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800"
                    >
                      {l.dist_products?.name} ×{l.planned_quantity}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {clp.format(Number(o.total))}
                  </span>
                  <span className="text-xs text-[#6d7c73]">
                    {uiLabel(o.payment_method)} · {uiLabel(o.payment_condition)}
                  </span>
                </div>
                {o.void_reason && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs">
                    <b>Motivo:</b> {o.void_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
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
              {activeOrders.map((o: any) => (
                <tr key={o.id} className="border-b border-[#e4ebe7]">
                  <td className="px-3 py-3 font-bold">
                    <div className="flex items-center gap-1.5">
                      <span>{o.route_position ?? "—"}</span>
                      {canManageRoutes && o.driver_id && (
                        <div className="flex flex-col">
                          <form action={reorderOrderAction}>
                            <input type="hidden" name="order_id" value={o.id} />
                            <input type="hidden" name="direction" value="up" />
                            <button
                              type="submit"
                              aria-label={`Subir pedido ${o.order_number} en la ruta`}
                              disabled={
                                routeBounds.get(o.driver_id)?.first === o.id
                              }
                              className="text-[#66776d] hover:text-[var(--oasis-primary)] disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ChevronUp size={14} />
                            </button>
                          </form>
                          <form action={reorderOrderAction}>
                            <input type="hidden" name="order_id" value={o.id} />
                            <input
                              type="hidden"
                              name="direction"
                              value="down"
                            />
                            <button
                              type="submit"
                              aria-label={`Bajar pedido ${o.order_number} en la ruta`}
                              disabled={
                                routeBounds.get(o.driver_id)?.last === o.id
                              }
                              className="text-[#66776d] hover:text-[var(--oasis-primary)] disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
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
                    <Link
                      className="text-xs font-semibold text-[var(--oasis-primary)]"
                      href={`/finance/distribution/orders/${o.id}`}
                    >
                      Ver / Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!activeOrders.length && (
            <p className="p-10 text-center text-sm text-[#6d7c73]">
              No hay pedidos para esta fecha.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
