"use client";

import { useMemo, useRef, useState } from "react";
import { createRouteOrderAction } from "@/modules/finance/distribution/application/actions";
import { CustomerCombobox } from "./customer-combobox";
import { buttonClass, inputClass } from "./module-nav";

type Customer = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  has_credit: boolean;
};
type Product = { id: string; code: string; name: string; presentation: string };

export function RouteOrderForm({
  customers,
  products,
  date,
}: {
  customers: Customer[];
  products: Product[];
  date: string;
}) {
  const [customerType, setCustomerType] = useState<"regular" | "express">(
    "regular",
  );
  const [customerId, setCustomerId] = useState("");
  const customer = customers.find((item) => item.id === customerId);
  const nextLineId = useRef(2);
  const [lines, setLines] = useState([{ id: 1, product_id: "", quantity: 1 }]);
  const payload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.product_id)
          .map((line) => ({
            product_id: line.product_id,
            quantity: Number(line.quantity),
          })),
      ),
    [lines],
  );
  const isExpress = customerType === "express";

  return (
    <form action={createRouteOrderAction} className="space-y-4">
      <input type="hidden" name="delivery_date" value={date} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="customer_type" value={customerType} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Tipo de cliente</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["regular", "Cliente habitual"],
              ["express", "Cliente express"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={customerType === value}
              onClick={() => {
                setCustomerType(value);
                setCustomerId("");
              }}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold ${customerType === value ? "border-[var(--oasis-primary)] bg-[var(--oasis-soft)] text-[var(--oasis-primary)]" : "bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {!isExpress ? (
        <label className="block text-sm font-medium">
          Cliente habitual
          <input type="hidden" name="customer_id" value={customerId} />
          <CustomerCombobox
            customers={customers}
            value={customerId}
            onChange={setCustomerId}
            required
          />
        </label>
      ) : (
        <>
          <input type="hidden" name="customer_id" value="" />
          <label className="block text-sm font-medium">
            Nombre del cliente express
            <input
              className={inputClass}
              name="occasional_customer_name"
              required
              maxLength={160}
            />
          </label>
        </>
      )}
      {!isExpress && (
        <input type="hidden" name="occasional_customer_name" value="" />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Dirección de entrega
          <input
            key={`${customerId}-address`}
            className={inputClass}
            name="delivery_address"
            defaultValue={customer?.address ?? ""}
            required
          />
        </label>
        <label className="text-sm font-medium">
          Teléfono
          <input
            key={`${customerId}-phone`}
            className={inputClass}
            name="customer_phone"
            defaultValue={customer?.phone ?? ""}
          />
        </label>
        <label className="text-sm font-medium">
          Forma de pago
          <select className={inputClass} name="payment_method">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            {!isExpress && customer?.has_credit && (
              <option value="credit">Crédito</option>
            )}
            <option value="mixed">Mixto</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Condición
          <select className={inputClass} name="payment_condition">
            <option value="cash">Contado</option>
            {!isExpress && customer?.has_credit && (
              <option value="credit">A crédito</option>
            )}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Productos</legend>
        {lines.map((line, index) => (
          <div key={line.id} className="grid grid-cols-[1fr_82px_auto] gap-2">
            <select
              aria-label={`Producto ${index + 1}`}
              className={inputClass}
              value={line.product_id}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, position) =>
                    position === index
                      ? { ...item, product_id: event.target.value }
                      : item,
                  ),
                )
              }
              required
            >
              <option value="">Producto</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Cantidad ${index + 1}`}
              className={inputClass}
              type="number"
              min="0.001"
              step="0.001"
              value={line.quantity}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, position) =>
                    position === index
                      ? { ...item, quantity: Number(event.target.value) }
                      : item,
                  ),
                )
              }
              required
            />
            <button
              type="button"
              aria-label={`Quitar producto ${index + 1}`}
              className="rounded-xl border px-3"
              onClick={() =>
                setLines((current) =>
                  current.filter((item) => item.id !== line.id),
                )
              }
              disabled={lines.length === 1}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-semibold text-[var(--oasis-primary)]"
          onClick={() => {
            const id = nextLineId.current++;
            setLines((current) => [
              ...current,
              { id, product_id: "", quantity: 1 },
            ]);
          }}
        >
          + Agregar producto
        </button>
      </fieldset>

      {isExpress && (
        <label className="flex items-start gap-2 rounded-xl bg-[var(--oasis-soft)] p-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            name="request_regular_customer"
          />
          Solicitar que este cliente express sea registrado como cliente
          habitual
        </label>
      )}
      <label className="block text-sm font-medium">
        Observaciones
        <textarea className={inputClass} name="notes" rows={2} />
      </label>
      <button className={`${buttonClass} w-full py-3`}>
        Agregar pedido a mi ruta
      </button>
    </form>
  );
}
