"use client";
import {
  requestOrderChangeAction,
  updateOrderAction,
} from "@/modules/finance/distribution/application/actions";
import { buttonClass, inputClass } from "./module-nav";
import { OrderLineItems } from "./order-line-items";

type Product = { id: string; code: string; name: string; presentation: string };
type Line = { product_id: string; quantity: number };

export function OrderEditForm({
  mode,
  orderId,
  products,
  initialLines,
  deliveryDate,
  estimatedTime,
  deliveryAddress,
  notes,
  discount,
}: {
  mode: "edit" | "request";
  orderId: string;
  products: Product[];
  initialLines: Line[];
  deliveryDate: string;
  estimatedTime: string;
  deliveryAddress: string;
  notes: string;
  discount: number;
}) {
  const action = mode === "edit" ? updateOrderAction : requestOrderChangeAction;
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="order_id" value={orderId} />
      {mode === "request" && <input type="hidden" name="type" value="edit" />}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Fecha de entrega
          <input
            className={inputClass}
            type="date"
            name="delivery_date"
            defaultValue={deliveryDate}
            required
          />
        </label>
        <label className="text-sm font-medium">
          Hora estimada
          <input
            className={inputClass}
            type="time"
            name="estimated_time"
            defaultValue={estimatedTime}
          />
        </label>
        <label className="text-sm font-medium">
          Descuento
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            name="discount"
            defaultValue={discount}
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Dirección de entrega
        <input
          className={inputClass}
          name="delivery_address"
          required
          defaultValue={deliveryAddress}
        />
      </label>
      <OrderLineItems products={products} initialLines={initialLines} />
      <label className="block text-sm font-medium">
        Observaciones
        <textarea
          className={inputClass}
          name="notes"
          rows={3}
          defaultValue={notes}
        />
      </label>
      {mode === "request" && (
        <label className="block text-sm font-medium">
          Motivo de la solicitud
          <textarea
            className={inputClass}
            name="reason"
            rows={2}
            required
            minLength={3}
            placeholder="Explica por qué se necesita este cambio."
          />
        </label>
      )}
      <p className="text-xs text-[#66776d]">
        {mode === "edit"
          ? "Los precios y el total se recalculan en el servidor al guardar."
          : "Un Administrador debe aprobar esta solicitud antes de aplicar los cambios; los precios y el total se recalculan al aprobar."}
      </p>
      <button className={buttonClass}>
        {mode === "edit" ? "Guardar cambios" : "Enviar solicitud de edición"}
      </button>
    </form>
  );
}
