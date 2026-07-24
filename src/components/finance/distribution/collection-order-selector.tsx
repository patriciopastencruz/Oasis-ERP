"use client";

import { useState } from "react";

type CollectionOrder = {
  id: string;
  orderNumber: string;
  date: string;
  products: string;
  total: string;
  balance: string;
};

export function CollectionOrderSelector({
  customerId,
  orders,
}: {
  customerId: string;
  orders: CollectionOrder[];
}) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <form
      action="/api/finance/distribution/statement.pdf"
      method="get"
      target="_blank"
    >
      <input type="hidden" name="customer" value={customerId} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[#63778e]">
              <th className="w-12 p-2">Cobrar</th>
              <th>Fecha</th>
              <th>Pedido</th>
              <th>Producto y cantidad</th>
              <th className="text-right">Total vendido</th>
              <th className="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b align-top last:border-0">
                <td className="p-2">
                  <input
                    aria-label={`Seleccionar pedido ${order.orderNumber}`}
                    className="h-4 w-4 accent-[var(--oasis-primary)]"
                    type="checkbox"
                    name="order"
                    value={order.id}
                    checked={selected.includes(order.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, order.id]
                          : current.filter((id) => id !== order.id),
                      )
                    }
                  />
                </td>
                <td className="py-2">{order.date}</td>
                <td className="py-2 font-mono font-semibold">
                  {order.orderNumber}
                </td>
                <td className="max-w-[360px] py-2">{order.products}</td>
                <td className="py-2 text-right">{order.total}</td>
                <td className="py-2 text-right font-semibold">
                  {order.balance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#63778e]">
          {selected.length} de {orders.length} pedido(s) seleccionados.
        </p>
        <button
          type="submit"
          disabled={selected.length === 0}
          className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generar reporte de cobranza
        </button>
      </div>
    </form>
  );
}
