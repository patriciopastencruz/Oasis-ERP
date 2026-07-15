/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { Flash } from "@/components/finance/distribution/module-nav";
import { OrderEditForm } from "@/components/finance/distribution/order-edit-form";
import { OrderVoidForm } from "@/components/finance/distribution/order-void-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import {
  clp,
  distributionOrderDetail,
} from "@/modules/finance/distribution/application/queries";

const NOT_EDITABLE_STATUSES = ["delivered", "partially_delivered", "cancelled", "voided"];
const VOIDABLE_STATUSES = ["scheduled", "assigned"];

export default async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { ctx, order, products, requests } = await distributionOrderDetail(id);
  if (!order) notFound();
  const editable = !NOT_EDITABLE_STATUSES.includes(order.status);
  const canEditDirectly = ctx.permissions.has(
    "finance.distribution.orders.manage",
  );
  const canRequestEdit = ctx.permissions.has(
    "finance.distribution.requests.create",
  );
  const voidable = VOIDABLE_STATUSES.includes(order.status);
  const initialLines = (order.dist_order_lines ?? []).map((l: any) => ({
    product_id: l.product_id,
    quantity: Number(l.planned_quantity),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title={`Pedido ${order.order_number}`}
        description="Detalle, edición y trazabilidad del pedido."
      />
      <Flash success={q.success} error={q.error} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <Panel>
            <p className="text-xs uppercase text-[#718078]">Estado</p>
            <p className="mt-1 font-semibold">
              {uiLabel(order.status)} · {uiLabel(order.payment_status)}
            </p>
            <p className="mt-3 text-xs uppercase text-[#718078]">Cliente</p>
            <p className="font-semibold">
              {order.dist_customers?.name ?? order.occasional_customer_name}
            </p>
            <p className="text-sm">{order.delivery_address}</p>
            <p className="text-sm text-[#66776d]">{order.customer_phone}</p>
            <p className="mt-3 text-xs uppercase text-[#718078]">Entrega</p>
            <p className="text-sm">
              {order.delivery_date} {order.estimated_time?.slice(0, 5) ?? ""}
            </p>
            <p className="mt-3 text-xs uppercase text-[#718078]">Total</p>
            <p className="text-lg font-bold">{clp.format(Number(order.total))}</p>
            {order.notes && (
              <>
                <p className="mt-3 text-xs uppercase text-[#718078]">
                  Observaciones
                </p>
                <p className="text-sm">{order.notes}</p>
              </>
            )}
          </Panel>
          <Panel>
            <p className="text-xs uppercase text-[#718078]">Productos actuales</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(order.dist_order_lines ?? []).map((l: any) => (
                <li key={l.id} className="flex justify-between">
                  <span>
                    {l.dist_products?.name} × {l.planned_quantity}
                  </span>
                  <span className="text-[#66776d]">
                    {clp.format(Number(l.line_total))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          {requests.length > 0 && (
            <Panel>
              <p className="text-xs uppercase text-[#718078]">Solicitudes</p>
              <ul className="mt-2 space-y-2 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="border-b border-[#e4ebe7] pb-2 last:border-0">
                    <p className="font-semibold">
                      {uiLabel(r.type)} · {uiLabel(r.status)}
                    </p>
                    <p className="text-[#66776d]">{r.reason}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <Panel>
          {!editable && (
            <p className="text-sm text-[#66776d]">
              Este pedido ya no admite edición porque está{" "}
              {uiLabel(order.status).toLowerCase()}.
            </p>
          )}
          {editable && canEditDirectly && (
            <OrderEditForm
              mode="edit"
              orderId={order.id}
              products={products}
              initialLines={initialLines}
              deliveryDate={order.delivery_date}
              estimatedTime={order.estimated_time?.slice(0, 5) ?? ""}
              deliveryAddress={order.delivery_address}
              notes={order.notes ?? ""}
              discount={Number(order.discount)}
            />
          )}
          {editable && !canEditDirectly && canRequestEdit && (
            <OrderEditForm
              mode="request"
              orderId={order.id}
              products={products}
              initialLines={initialLines}
              deliveryDate={order.delivery_date}
              estimatedTime={order.estimated_time?.slice(0, 5) ?? ""}
              deliveryAddress={order.delivery_address}
              notes={order.notes ?? ""}
              discount={Number(order.discount)}
            />
          )}
          {voidable && canEditDirectly && (
            <div className="mt-5 border-t border-[#e4ebe7] pt-4">
              <OrderVoidForm mode="void" orderId={order.id} />
            </div>
          )}
          {voidable && !canEditDirectly && canRequestEdit && (
            <div className="mt-5 border-t border-[#e4ebe7] pt-4">
              <OrderVoidForm mode="request" orderId={order.id} />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
