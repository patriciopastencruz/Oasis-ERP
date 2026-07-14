/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MapPin,
  Phone,
  Truck,
  CheckCircle2,
  PackageX,
  Plus,
} from "lucide-react";
import { Flash } from "@/components/finance/distribution/module-nav";
import { RouteOrderForm } from "@/components/finance/distribution/route-order-form";
import { PageHeader } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { changeOrderStatusAction } from "@/modules/finance/distribution/application/actions";
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
  const date =
    q.date ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
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
  if (ctx.permissions.has("finance.distribution.driver"))
    query = query.eq("driver_id", ctx.user.id);
  const [orders, customers, products] = await Promise.all([
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
  ]);
  const data = orders.data;
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Mi ruta"
        description="Entregas planificadas y ventas no planificadas realizadas durante la ruta."
      />
      <Flash success={q.success} error={q.error} />
      <div className="mx-auto max-w-2xl space-y-4">
        {ctx.permissions.has("finance.distribution.driver") && (
          <details className="group overflow-hidden rounded-2xl border border-[#bcd2c5] bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-semibold text-[#176b46] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-[#176b46] text-white">
                  <Plus size={20} />
                </span>
                Registrar venta en ruta
              </span>
              <span className="text-xs font-normal text-[#66776d] group-open:hidden">
                Habitual o express
              </span>
            </summary>
            <div className="border-t border-[#e0e8e3] p-4">
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
            className="overflow-hidden rounded-2xl border border-[#dce4df] bg-white shadow-sm"
          >
            <div className="flex items-center justify-between bg-[#123525] px-4 py-3 text-white">
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
              <div className="rounded-xl bg-[#f2f7f4] p-3">
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
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {o.status === "assigned" && (
                  <form action={changeOrderStatusAction}>
                    <input type="hidden" name="order_id" value={o.id} />
                    <button
                      name="status"
                      value="en_route"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white"
                    >
                      <Truck size={18} />
                      En ruta
                    </button>
                  </form>
                )}
                {o.status === "en_route" && (
                  <>
                    <form action={changeOrderStatusAction}>
                      <input type="hidden" name="order_id" value={o.id} />
                      <button
                        name="status"
                        value="delivered"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white"
                      >
                        <CheckCircle2 size={18} />
                        Entregado
                      </button>
                    </form>
                    <form
                      action={changeOrderStatusAction}
                      className="sm:col-span-2"
                    >
                      <input type="hidden" name="order_id" value={o.id} />
                      <input
                        name="reason"
                        className="mb-2 w-full rounded-xl border p-2 text-sm"
                        placeholder="Motivo obligatorio"
                        required
                      />
                      <button
                        name="status"
                        value="not_delivered"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 py-3 text-sm font-semibold text-white"
                      >
                        <PackageX size={18} />
                        No entregado
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
        {!data?.length && (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-[#718078]">
            No tienes entregas asignadas para hoy.
          </div>
        )}
      </div>
    </>
  );
}
