/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapPin, Phone, Truck, CheckCircle2, PackageX } from "lucide-react";
import { Flash } from "@/components/finance/distribution/module-nav";
import { PageHeader } from "@/components/ui/page";
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
  const { data } = await query;
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Mi ruta"
        description="Vista móvil de entregas en el orden planificado."
      />
      <Flash success={q.success} error={q.error} />
      <div className="mx-auto max-w-2xl space-y-4">
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
                {o.status}
              </span>
            </div>
            <div className="p-4">
              <h2 className="text-xl font-bold">
                {o.dist_customers?.name ?? o.occasional_customer_name}
              </h2>
              <p className="mt-1 text-sm">{o.delivery_address}</p>
              <div className="my-4 flex gap-2">
                <a
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}`}
                  target="_blank"
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
