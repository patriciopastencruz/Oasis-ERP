"use client";
import { useEffect, useMemo, useState } from "react";
import {
  createOrderAction,
  resolveOrderPricesAction,
  type OrderPricePreview,
} from "@/modules/finance/distribution/application/actions";
import { CustomerCombobox } from "./customer-combobox";
import { buttonClass, inputClass } from "./module-nav";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type Customer = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  has_credit: boolean;
  credit_limit: number;
  credit_days: number;
};
type Product = { id: string; code: string; name: string; presentation: string };
export function OrderForm({
  customers,
  products,
  initialDate,
}: {
  customers: Customer[];
  products: Product[];
  initialDate: string;
}) {
  const [customerId, setCustomerId] = useState("");
  const customer = customers.find((x) => x.id === customerId);
  const [deliveryDate, setDeliveryDate] = useState(initialDate);
  const [lines, setLines] = useState([{ product_id: "", quantity: 1 }]);
  const [prices, setPrices] = useState<Record<string, OrderPricePreview>>({});
  const [pricesKey, setPricesKey] = useState<string | null>(null);
  const loadingPrices = pricesKey !== `${customerId}|${deliveryDate}`;
  useEffect(() => {
    let cancelled = false;
    resolveOrderPricesAction(customerId, deliveryDate).then((result) => {
      if (cancelled) return;
      setPrices(result);
      setPricesKey(`${customerId}|${deliveryDate}`);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, deliveryDate]);
  const total = lines.reduce((sum, line) => {
    const price = prices[line.product_id];
    return price ? sum + price.amount * Number(line.quantity || 0) : sum;
  }, 0);
  const payload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((x) => x.product_id)
          .map((x) => ({ ...x, quantity: Number(x.quantity) })),
      ),
    [lines],
  );
  return (
    <form
      action={createOrderAction}
      className="space-y-5"
      onSubmit={(e) => {
        if (!confirm("¿Confirmas que deseas crear este pedido?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="lines" value={payload} />
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Fecha de entrega
          <input
            className={inputClass}
            type="date"
            name="delivery_date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium">
          Hora estimada
          <input className={inputClass} type="time" name="estimated_time" />
        </label>
        <label className="text-sm font-medium">
          Prioridad
          <select className={inputClass} name="priority" defaultValue="normal">
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Cliente registrado
        <input type="hidden" name="customer_id" value={customerId} />
        <CustomerCombobox
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
          required
        />
      </label>
      {customer && (
        <div className="rounded-xl bg-[var(--oasis-soft)] p-4 text-sm">
          <b>{customer.address}</b>
          <span className="ml-3 text-[#66776d]">{customer.phone}</span>
          <p className="mt-1">
            Crédito:{" "}
            {customer.has_credit
              ? `autorizado · cupo ${Number(customer.credit_limit).toLocaleString("es-CL")} · ${customer.credit_days} días`
              : "no autorizado"}
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Dirección de entrega
          <input
            className={inputClass}
            name="delivery_address"
            required
            defaultValue={customer?.address ?? ""}
            key={customer?.id + "address"}
          />
        </label>
        <label className="text-sm font-medium">
          Teléfono
          <input
            className={inputClass}
            name="customer_phone"
            defaultValue={customer?.phone ?? ""}
            key={customer?.id + "phone"}
          />
        </label>
        <label className="text-sm font-medium">
          Forma de pago
          <select className={inputClass} name="payment_method">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            {customer?.has_credit && <option value="credit">Crédito</option>}
            <option value="mixed">Mixto</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Condición
          <select className={inputClass} name="payment_condition">
            <option value="cash">Contado</option>
            {customer?.has_credit && <option value="credit">A crédito</option>}
          </select>
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Productos</legend>
        {lines.map((line, index) => {
          const price = prices[line.product_id];
          const lineTotal = price
            ? price.amount * Number(line.quantity || 0)
            : 0;
          return (
            <div key={index} className="space-y-1">
              <div className="grid grid-cols-[1fr_110px_auto] gap-2">
                <select
                  aria-label={`Producto ${index + 1}`}
                  className={inputClass}
                  value={line.product_id}
                  onChange={(e) =>
                    setLines((all) =>
                      all.map((x, i) =>
                        i === index ? { ...x, product_id: e.target.value } : x,
                      ),
                    )
                  }
                  required
                >
                  <option value="">Seleccionar producto</option>
                  {products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} · {x.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Cantidad ${index + 1}`}
                  className={inputClass}
                  type="number"
                  min="1"
                  step="1"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((all) =>
                      all.map((x, i) =>
                        i === index
                          ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded-xl border px-3"
                  onClick={() =>
                    setLines((all) => all.filter((_, i) => i !== index))
                  }
                  disabled={lines.length === 1}
                >
                  Quitar
                </button>
              </div>
              {line.product_id && (
                <p className="text-xs text-[#66776d]">
                  {loadingPrices && !price ? (
                    "Calculando precio…"
                  ) : price ? (
                    <>
                      {clp.format(price.amount)} c/u
                      {price.origin === "customer" && " · precio cliente"}
                      {" · subtotal "}
                      <b>{clp.format(lineTotal)}</b>
                    </>
                  ) : (
                    <span className="text-amber-700">
                      Sin precio vigente para este producto.
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      <button
        type="button"
        className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2 text-sm text-[var(--oasis-primary)]"
        onClick={() => setLines((x) => [...x, { product_id: "", quantity: 1 }])}
      >
        + Agregar producto
      </button>
      {lines.some((l) => l.product_id) && (
        <div className="rounded-xl bg-[var(--oasis-soft)] p-4 text-right">
          <span className="text-sm text-[#66776d]">Total estimado </span>
          <span className="text-lg font-bold">{clp.format(total)}</span>
        </div>
      )}
      <label className="block text-sm font-medium">
        Observaciones
        <textarea className={inputClass} name="notes" rows={3} />
      </label>
      <p className="text-xs text-[#66776d]">
        Los precios, el crédito disponible y el total se validan nuevamente en
        el servidor al confirmar.
      </p>
      <button className={buttonClass}>Crear pedido</button>
    </form>
  );
}
