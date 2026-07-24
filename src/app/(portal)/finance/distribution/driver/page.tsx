/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { MapPin, Phone, Plus, Wallet } from "lucide-react";
import { DeliveryActions } from "@/components/finance/distribution/delivery-actions";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { RouteOrderForm } from "@/components/finance/distribution/route-order-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { submitDriverClosureAction } from "@/modules/finance/distribution/application/actions";
import {
  clp,
  distributionContext,
} from "@/modules/finance/distribution/application/queries";
export default async function Driver({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const date = q.date ?? today;
  const previous = new Date(`${date}T12:00:00`);
  previous.setDate(previous.getDate() - 1);
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const { ctx, unit, supabase } = await distributionContext();
  let query = supabase
    .from("dist_orders")
    .select(
      "*,dist_customers(name),dist_order_lines(id,planned_quantity,dist_products(name))",
    )
    .eq("business_unit_id", unit.id)
    .eq("delivery_date", date)
    .not("driver_id", "is", null)
    .order("route_position");
  const isDriver = ctx.role?.key === "driver";
  if (isDriver) query = query.eq("driver_id", ctx.user.id);
  const [orders, customers, products, closure] = await Promise.all([
    query,
    supabase
      .from("dist_customers")
      .select("id,code,name,address,phone,has_credit")
      .eq("business_unit_id", unit.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("dist_products")
      .select("id,code,name,presentation")
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .is("deleted_at", null)
      .order("display_order"),
    isDriver
      ? supabase
          .from("dist_driver_closures")
          .select("declared_cash,pending_amount,observations")
          .eq("business_unit_id", unit.id)
          .eq("driver_id", ctx.user.id)
          .eq("closure_date", date)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const data = orders.data;
  const existingClosure = closure.data;
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Mi ruta"
        description="Entregas planificadas y ventas no planificadas realizadas durante la ruta."
      />
      <Flash success={q.success} error={q.error} />
      <div className="mx-auto max-w-2xl space-y-4">
        <Panel className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="rounded-lg border px-3 py-2 text-xs font-medium"
              href={`/finance/distribution/driver?date=${previous.toLocaleDateString("en-CA")}`}
            >
              ← Día anterior
            </Link>
            <form className="flex items-center gap-2">
              <label className="sr-only" htmlFor="driver-route-date">
                Fecha de la ruta
              </label>
              <div className="w-40">
                <input
                  id="driver-route-date"
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
              href={`/finance/distribution/driver?date=${next.toLocaleDateString("en-CA")}`}
            >
              Día siguiente →
            </Link>
            {date !== today && (
              <Link
                className={`${buttonClass} ml-auto rounded-lg px-3 py-2 text-xs`}
                href="/finance/distribution/driver"
              >
                Volver a hoy
              </Link>
            )}
          </div>
        </Panel>
        {isDriver && (
          <details className="group overflow-hidden rounded-2xl border border-[var(--oasis-border)] bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-semibold text-[var(--oasis-primary)] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-[var(--oasis-primary)] text-white">
                  <Plus size={20} />
                </span>
                Registrar venta en ruta
              </span>
              <span className="text-xs font-normal text-[#5b6d82] group-open:hidden">
                Habitual o express
              </span>
            </summary>
            <div className="border-t border-[#dee4ea] p-4">
              <RouteOrderForm
                customers={(customers.data ?? []) as any}
                products={(products.data ?? []) as any}
                date={date}
              />
            </div>
          </details>
        )}
        {data?.map((o: any) => (
          <article
            key={o.id}
            className="overflow-hidden rounded-2xl border border-[#d9dfe6] bg-white shadow-sm"
          >
            <div className="flex items-center justify-between bg-[var(--oasis-sidebar)] px-4 py-3 text-white">
              <span className="text-sm font-semibold">
                Parada {o.route_position} · {o.order_number}
              </span>
              <span className="rounded-full bg-white/15 px-2 py-1 text-xs">
                {uiLabel(o.status)}
              </span>
            </div>
            <div className="p-4">
              <h2 className="text-xl font-bold">
                {o.dist_customers?.name ?? o.occasional_customer_name}
              </h2>
              {o.route_sale && (
                <span className="mt-2 inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                  Venta en ruta
                </span>
              )}
              <p className="mt-1 text-sm">{o.delivery_address}</p>
              <div className="my-4 flex gap-2">
                <a
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={18} />
                  Abrir mapa
                </a>
                {o.customer_phone && (
                  <a
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"
                    href={`tel:${o.customer_phone}`}
                  >
                    <Phone size={18} />
                    Llamar
                  </a>
                )}
              </div>
              <div className="rounded-xl bg-[var(--oasis-soft)] p-3">
                {o.dist_order_lines.map((l: any) => (
                  <p key={l.id} className="text-sm">
                    <b>{l.planned_quantity}×</b> {l.dist_products?.name}
                  </p>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span>
                  {o.payment_condition === "credit"
                    ? "Venta a crédito"
                    : "Debe cobrar"}
                </span>
                <b>{clp.format(Number(o.total))}</b>
              </div>
              {(o.status === "assigned" || o.status === "en_route") && (
                <DeliveryActions
                  orderId={o.id}
                  paymentCondition={o.payment_condition}
                  paymentMethod={o.payment_method}
                />
              )}
            </div>
          </article>
        ))}
        {!data?.length && (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-[#63778e]">
            {date === today
              ? "No tienes entregas asignadas para hoy."
              : "No tienes entregas asignadas para esta fecha."}
          </div>
        )}
        {isDriver && (
          <details className="group overflow-hidden rounded-2xl border border-[var(--oasis-border)] bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-semibold text-[var(--oasis-primary)] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-[var(--oasis-primary)] text-white">
                  <Wallet size={20} />
                </span>
                Cierre de caja
              </span>
              <span className="text-xs font-normal text-[#5b6d82] group-open:hidden">
                {existingClosure ? "Ya declarado" : "Fin de la ruta"}
              </span>
            </summary>
            <div className="border-t border-[#dee4ea] p-4">
              <form action={submitDriverClosureAction} className="space-y-3">
                <input type="hidden" name="date" value={date} />
                <label className="block text-sm">
                  Fecha
                  <input
                    className={`${inputClass} mt-1`}
                    type="date"
                    value={date}
                    disabled
                  />
                </label>
                <label className="block text-sm">
                  Efectivo declarado
                  <input
                    className={`${inputClass} mt-1`}
                    name="declared_cash"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue={existingClosure?.declared_cash ?? 0}
                  />
                </label>
                <label className="block text-sm">
                  Pendiente de pago
                  <input
                    className={`${inputClass} mt-1`}
                    name="pending_amount"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue={existingClosure?.pending_amount ?? 0}
                  />
                </label>
                <label className="block text-sm">
                  Observaciones generales
                  <textarea
                    className={`${inputClass} mt-1 min-h-24 resize-y`}
                    name="observations"
                    maxLength={1500}
                    defaultValue={existingClosure?.observations ?? ""}
                    placeholder="Incidencias, clientes ausentes, detalle del efectivo, etc."
                  />
                </label>
                <button className={`${buttonClass} w-full`}>
                  {existingClosure ? "Actualizar cierre" : "Enviar cierre"}
                </button>
              </form>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
