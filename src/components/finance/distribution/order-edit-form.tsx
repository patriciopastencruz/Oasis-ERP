"use client";
import { updateOrderAction } from "@/modules/finance/distribution/application/actions";
import { buttonClass, inputClass } from "./module-nav";
import { OrderLineItems } from "./order-line-items";

type Product = { id: string; code: string; name: string; presentation: string };
type Line = { product_id: string; quantity: number };

export function OrderEditForm({
  orderId,
  products,
  initialLines,
  deliveryDate,
  estimatedTime,
  deliveryAddress,
  notes,
  discount,
}: {
  orderId: string;
  products: Product[];
  initialLines: Line[];
  deliveryDate: string;
  estimatedTime: string;
  deliveryAddress: string;
  notes: string;
  discount: number;
}) {
  return (
    <form action={updateOrderAction} className="space-y-5">
      <input type="hidden" name="order_id" value={orderId} />
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
      <p className="text-xs text-[#5b6d82]">
        Los cambios se aplican de inmediato y se notifica a los responsables.
        Los precios y el total se recalculan en el servidor al guardar.
      </p>
      <button className={buttonClass}>
        Guardar cambios
      </button>
    </form>
  );
}
