"use client";
import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/page";
import { CollectionOrderSelector } from "./collection-order-selector";
import { inputClass } from "./module-nav";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type StatementOrder = {
  id: string;
  orderNumber: string;
  date: string;
  products: string;
  total: number;
  balance: number;
};

type StatementRow = {
  id: string;
  code: string;
  name: string;
  classificationName: string;
  sold: number;
  paid: number;
  balance: number;
  overdue: number;
  dueLabel: string;
  lastPaymentLabel: string;
  orders: StatementOrder[];
};

export function AccountStatementsResults({
  rows,
  canExport,
}: {
  rows: StatementRow[];
  canExport: boolean;
}) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es-CL");
    if (!term) return rows;
    return rows.filter(
      (row) =>
        row.name.toLocaleLowerCase("es-CL").includes(term) ||
        row.code.toLocaleLowerCase("es-CL").includes(term),
    );
  }, [rows, query]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (sum, row) => ({
          sold: sum.sold + row.sold,
          paid: sum.paid + row.paid,
          balance: sum.balance + row.balance,
          overdue: sum.overdue + row.overdue,
        }),
        { sold: 0, paid: 0, balance: 0, overdue: 0 },
      ),
    [visible],
  );

  return (
    <>
      <Panel className="mb-5">
        <label className="block text-sm">
          Buscar cliente
          <input
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe para buscar por código o nombre…"
            autoComplete="off"
          />
        </label>
      </Panel>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Venta a crédito", totals.sold],
          ["Total abonado", totals.paid],
          ["Saldo pendiente", totals.balance],
          ["Deuda vencida", totals.overdue],
        ].map(([label, value]) => (
          <Panel key={label as string}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#63778e]">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold">
              {clp.format(value as number)}
            </p>
          </Panel>
        ))}
      </div>

      <Panel className="overflow-x-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Cartera de clientes</h2>
            <p className="text-sm text-[#63778e]">
              {visible.length} cliente(s) según los filtros seleccionados.
            </p>
          </div>
        </div>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[#63778e]">
              <th className="p-2">Cliente</th>
              <th>Clasificación</th>
              <th className="text-right">Venta crédito</th>
              <th className="text-right">Abonado</th>
              <th className="text-right">Saldo</th>
              <th className="text-right">Vencido</th>
              <th>Vencimiento</th>
              <th>Último pago</th>
              <th>Estado</th>
              <th>Documento</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((customer) => (
              <tr key={customer.id} className="border-b align-top">
                <td className="p-2">
                  <b>{customer.name}</b>
                  <div className="font-mono text-xs text-[#63778e]">
                    {customer.code}
                  </div>
                </td>
                <td>{customer.classificationName}</td>
                <td className="text-right">{clp.format(customer.sold)}</td>
                <td className="text-right">{clp.format(customer.paid)}</td>
                <td className="text-right font-semibold">
                  {clp.format(customer.balance)}
                </td>
                <td className="text-right font-semibold text-red-700">
                  {clp.format(customer.overdue)}
                </td>
                <td>{customer.dueLabel}</td>
                <td>{customer.lastPaymentLabel}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${customer.overdue > 0 ? "bg-red-100 text-red-800" : customer.balance > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {customer.overdue > 0
                      ? "Vencido"
                      : customer.balance > 0
                        ? "Al día"
                        : "Pagado"}
                  </span>
                </td>
                <td>
                  {canExport ? (
                    <a
                      className="font-semibold text-[var(--oasis-primary)] underline"
                      href={`/api/finance/distribution/statement.pdf?customer=${customer.id}`}
                    >
                      PDF
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[#63778e]">
                  No hay clientes que coincidan con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <div className="mt-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Pedidos por cobrar</h2>
          <p className="text-sm text-[#63778e]">
            Selecciona únicamente los pedidos que se incluirán en el reporte
            para el cliente.
          </p>
        </div>
        {visible.map((customer) => {
          if (customer.orders.length === 0) return null;
          return (
            <Panel key={customer.id}>
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{customer.name}</p>
                      <p className="text-xs text-[#63778e]">
                        {customer.code} · {customer.orders.length} pedido(s) con
                        saldo
                      </p>
                    </div>
                    <p className="font-semibold text-[var(--oasis-primary)]">
                      {clp.format(customer.balance)} pendiente
                    </p>
                  </div>
                </summary>
                <div className="mt-4 border-t pt-3">
                  <CollectionOrderSelector
                    customerId={customer.id}
                    orders={customer.orders.map((order) => ({
                      id: order.id,
                      orderNumber: order.orderNumber,
                      date: order.date,
                      products: order.products,
                      total: clp.format(order.total),
                      balance: clp.format(order.balance),
                    }))}
                  />
                </div>
              </details>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
