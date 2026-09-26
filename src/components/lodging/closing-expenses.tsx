"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Line = { description: string; amount: string; payment_method: string; category_id: string };

const methods = [
  ["cash", "Efectivo"],
  ["transfer", "Transferencia"],
  ["card", "Tarjeta"],
  ["other", "Otro"],
] as const;

const digits = (value: string) => value.replace(/\D/g, "");
const format = (value: string) => (value ? Number(value).toLocaleString("es-CL") : "");

/** Gastos manuales del cierre; se envían como JSON en un campo oculto. */
export function ClosingExpenses({
  initial,
  categories,
  disabled,
}: {
  initial: { description: string; amount: number; payment_method: string; category_id?: string | null }[];
  categories: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(
    initial.map((e) => ({
      description: e.description,
      payment_method: e.payment_method,
      amount: String(Math.round(e.amount)),
      category_id: e.category_id ?? "",
    })),
  );
  const update = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const payload = lines
    .filter((line) => line.description.trim() || line.amount)
    .map((line) => ({
      description: line.description.trim(),
      amount: Number(line.amount || 0),
      payment_method: line.payment_method,
      category_id: line.category_id,
    }));
  const field = "w-full rounded-lg border border-[#d5dce4] bg-white px-2.5 py-2 text-sm";

  return (
    <div>
      <input type="hidden" name="expenses" value={JSON.stringify(payload)} />
      {lines.length === 0 && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Sin gastos registrados en el día.</p>
      )}
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[1fr_110px_40px] gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-[1fr_130px_130px_40px]">
            <select
              aria-label="Categoría del gasto"
              value={line.category_id}
              required
              disabled={disabled}
              onChange={(e) => update(index, { category_id: e.target.value })}
              className={`${field} col-span-3 sm:col-span-4 ${line.category_id ? "" : "text-slate-400"}`}
            >
              <option value="" disabled>
                Categoría del gasto…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Descripción del gasto"
              placeholder="Descripción (ej.: gas, pan, aseo)"
              value={line.description}
              maxLength={200}
              required
              disabled={disabled}
              onChange={(e) => update(index, { description: e.target.value })}
              className={`${field} col-span-3 sm:col-span-1`}
            />
            <input
              aria-label="Monto"
              inputMode="numeric"
              placeholder="$0"
              value={format(line.amount)}
              required
              disabled={disabled}
              onChange={(e) => update(index, { amount: digits(e.target.value) })}
              className={`${field} text-right`}
            />
            <select
              aria-label="Medio de pago"
              value={line.payment_method}
              disabled={disabled}
              onChange={(e) => update(index, { payment_method: e.target.value })}
              className={field}
            >
              {methods.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Quitar gasto"
              disabled={disabled}
              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              className="grid place-items-center rounded-lg border text-slate-500 hover:text-red-700"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          disabled={disabled || lines.length >= 50}
          onClick={() => setLines((current) => [...current, { description: "", amount: "", payment_method: "cash", category_id: "" }])}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-[#0b4f9c]"
        >
          <Plus size={15} /> Agregar gasto
        </button>
        <span className="text-sm">
          Gasto total: <b className="tabular-nums">${total.toLocaleString("es-CL")}</b>
        </span>
      </div>
    </div>
  );
}
