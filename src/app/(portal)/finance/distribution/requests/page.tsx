/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Flash,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { reviewOrderChangeAction } from "@/modules/finance/distribution/application/actions";
import { distributionContext } from "@/modules/finance/distribution/application/queries";

const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(
        new Date(`${value.slice(0, 10)}T12:00:00Z`),
      )
    : "—";

export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await distributionContext();
  const [{ data }, { data: products }] = await Promise.all([
    supabase
      .from("dist_change_requests")
      .select(
        "*,dist_orders(order_number,delivery_date,delivery_address,dist_customers(name),occasional_customer_name,dist_order_lines(planned_quantity,dist_products(name,presentation)))",
      )
      .eq("business_unit_id", unit.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("dist_products")
      .select("id,code,name")
      .eq("business_unit_id", unit.id),
  ]);
  const productName = (id: string) => {
    const product = products?.find((p) => p.id === id);
    return product ? `${product.code} · ${product.name}` : id;
  };
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Solicitudes"
        description="Ediciones y anulaciones del Administrativo con revisión trazable."
      />
      <Flash success={q.success} error={q.error} />
      <div className="space-y-3">
        {data?.map((x: any) => (
          <Panel key={x.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-[#718078]">
                  {uiLabel(x.type)} · {uiLabel(x.status)}
                </p>
                <h2 className="font-semibold">
                  Pedido {x.dist_orders?.order_number}
                </h2>
                <p className="text-sm font-semibold text-[var(--oasis-primary)]">
                  {x.dist_orders?.dist_customers?.name ??
                    x.dist_orders?.occasional_customer_name ??
                    "Cliente no disponible"}
                </p>
                <div className="mt-2 rounded-lg border border-[#e4ebe7] p-3 text-xs">
                  <p className="font-semibold">Pedido a revisar</p>
                  <p>Entrega: {dateLabel(x.dist_orders?.delivery_date)}</p>
                  <p>Dirección: {x.dist_orders?.delivery_address}</p>
                  <ul className="mt-1">
                    {(x.dist_orders?.dist_order_lines ?? []).map(
                      (l: any, i: number) => (
                        <li key={i}>
                          {l.dist_products?.name}
                          {l.dist_products?.presentation
                            ? ` (${l.dist_products.presentation})`
                            : ""}{" "}
                          × {l.planned_quantity}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <p className="mt-2 text-sm">
                  <b>Motivo:</b> {x.reason}
                </p>
                {x.type === "edit" && x.proposed_data?.lines && (
                  <div className="mt-2 rounded-lg bg-[var(--oasis-soft)] p-3 text-xs">
                    <p className="font-semibold">Cambios propuestos</p>
                    <p>
                      Entrega: {x.proposed_data.delivery_date}{" "}
                      {x.proposed_data.estimated_time}
                    </p>
                    <p>Dirección: {x.proposed_data.delivery_address}</p>
                    {x.proposed_data.notes && (
                      <p>Notas: {x.proposed_data.notes}</p>
                    )}
                    <p className="mt-1 font-semibold">Productos:</p>
                    <ul>
                      {x.proposed_data.lines.map(
                        (
                          l: { product_id: string; quantity: number },
                          i: number,
                        ) => (
                          <li key={i}>
                            {productName(l.product_id)} × {l.quantity}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-xs text-[#718078]">
                  {new Date(x.created_at).toLocaleString("es-CL")}
                </p>
              </div>
              {ctx.permissions.has("finance.distribution.requests.review") &&
                ["pending", "in_review"].includes(x.status) && (
                  <form
                    action={reviewOrderChangeAction}
                    className="flex min-w-72 flex-col gap-2"
                  >
                    <input type="hidden" name="request_id" value={x.id} />
                    <input
                      className={inputClass}
                      name="comment"
                      placeholder="Comentario de resolución"
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        name="decision"
                        value="approved"
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white"
                      >
                        Aprobar
                      </button>
                      <button
                        name="decision"
                        value="rejected"
                        className="rounded-lg bg-red-700 px-3 py-2 text-xs text-white"
                      >
                        Rechazar
                      </button>
                    </div>
                  </form>
                )}
            </div>
          </Panel>
        ))}
        {!data?.length && (
          <Panel>
            <p className="text-sm text-[#718078]">No hay solicitudes.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
