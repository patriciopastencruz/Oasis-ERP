"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/page";
import { inputClass } from "./module-nav";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  classificationName: string;
  statusLabel: string;
  creditLabel: string;
  balance: number;
  overdue: number;
  manageHref: string;
  manageLabel: string;
};

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es-CL");
    if (!term) return customers;
    return customers.filter(
      (x) =>
        x.name.toLocaleLowerCase("es-CL").includes(term) ||
        x.code.toLocaleLowerCase("es-CL").includes(term),
    );
  }, [customers, query]);

  return (
    <Panel className="overflow-x-auto">
      <label className="mb-4 block text-sm">
        Buscar cliente
        <input
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escribe para buscar por código o nombre…"
          autoComplete="off"
        />
      </label>
      <p className="mb-3 text-xs text-[#718078]">
        {visible.length} de {customers.length} cliente(s)
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Código</th>
            <th>Cliente</th>
            <th>Clasificación</th>
            <th>Estado</th>
            <th>Crédito</th>
            <th>Deuda</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((x) => (
            <tr key={x.id} className="border-b">
              <td className="p-2 font-mono text-xs">{x.code}</td>
              <td>
                <b>{x.name}</b>
                <br />
                <span className="text-xs text-[#718078]">
                  {x.address} · {x.phone}
                </span>
              </td>
              <td>{x.classificationName}</td>
              <td>{x.statusLabel}</td>
              <td>{x.creditLabel}</td>
              <td>
                {x.balance > 0 ? (
                  <span
                    className={`font-semibold ${x.overdue > 0 ? "text-red-700" : "text-amber-700"}`}
                  >
                    {clp.format(x.balance)}
                    {x.overdue > 0 ? " · vencida" : ""}
                  </span>
                ) : (
                  <span className="text-[#718078]">Sin deuda</span>
                )}
              </td>
              <td>
                <Link
                  className="font-semibold text-[var(--oasis-primary)] underline"
                  href={x.manageHref}
                >
                  {x.manageLabel}
                </Link>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-[#718078]">
                Sin coincidencias.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}
