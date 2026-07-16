"use client";
import { CheckCircle2, PackageX } from "lucide-react";
import { deliverOrderAction } from "@/modules/finance/distribution/application/actions";

export function DeliveryActions({
  orderId,
  paymentCondition,
  paymentMethod,
}: {
  orderId: string;
  paymentCondition: string;
  paymentMethod: string;
}) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <form
        action={deliverOrderAction}
        onSubmit={(e) => {
          if (!confirm("¿Confirmas que este pedido fue entregado?")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="status" value="delivered" />
        {paymentCondition !== "credit" && (
          <select
            name="payment_method"
            required
            defaultValue={
              ["cash", "transfer"].includes(paymentMethod)
                ? paymentMethod
                : "cash"
            }
            className="mb-2 w-full rounded-xl border p-2 text-sm"
          >
            <option value="cash">Cobrar en efectivo</option>
            <option value="transfer">Cobrar por transferencia</option>
          </select>
        )}
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white">
          <CheckCircle2 size={18} />
          Entregado
        </button>
      </form>
      <form
        action={deliverOrderAction}
        onSubmit={(e) => {
          if (!confirm("¿Confirmas que este pedido NO fue entregado?")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="status" value="not_delivered" />
        <input
          name="reason"
          className="mb-2 w-full rounded-xl border p-2 text-sm"
          placeholder="Motivo obligatorio"
          required
        />
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 py-3 text-sm font-semibold text-white">
          <PackageX size={18} />
          No entregado
        </button>
      </form>
    </div>
  );
}
