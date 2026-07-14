"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { inputClass } from "@/modules/inventory/ui";

type Material = {
  id: string;
  code: string;
  name: string;
  current_stock: number | string;
  unit_of_measure: string;
};
type Line = {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
};

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  materialId: "",
  quantity: "",
  unitPrice: "",
});
const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function InvoiceLines({ materials }: { materials: Material[] }) {
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const totals = useMemo(
    () =>
      lines.map(
        (line) => Number(line.quantity || 0) * Number(line.unitPrice || 0),
      ),
    [lines],
  );
  const invoiceTotal = totals.reduce((sum, total) => sum + total, 0);
  function update(key: string, field: keyof Omit<Line, "key">, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  }
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Materiales comprados</h2>
          <p className="mt-1 text-xs text-slate-500">
            Agrega una línea por material. El total se calcula automáticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLines((current) => [...current, newLine()])}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--oasis-primary)] px-3 py-2 text-sm font-semibold text-[var(--oasis-primary)]"
        >
          <Plus size={16} /> Agregar producto
        </button>
      </div>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={line.key} className="rounded-2xl border bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <b className="text-sm">Producto {index + 1}</b>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.key !== line.key),
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"
                >
                  <Trash2 size={14} /> Quitar
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_140px_180px_180px]">
              <label className="text-xs font-medium">
                Material
                <select
                  name="material_id"
                  value={line.materialId}
                  onChange={(e) =>
                    update(line.key, "materialId", e.target.value)
                  }
                  className={inputClass}
                  required
                >
                  <option value="">Selecciona un material</option>
                  {materials.map((material) => (
                    <option
                      value={material.id}
                      key={material.id}
                      disabled={lines.some(
                        (other) =>
                          other.key !== line.key &&
                          other.materialId === material.id,
                      )}
                    >
                      {material.code} · {material.name} · Stock:{" "}
                      {material.current_stock} {material.unit_of_measure}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Cantidad
                <input
                  name="quantity"
                  value={line.quantity}
                  onChange={(e) => update(line.key, "quantity", e.target.value)}
                  type="number"
                  min="0.001"
                  step="0.001"
                  className={inputClass}
                  required
                />
              </label>
              <label className="text-xs font-medium">
                Precio unitario
                <input
                  name="unit_price"
                  value={line.unitPrice}
                  onChange={(e) =>
                    update(line.key, "unitPrice", e.target.value)
                  }
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  required
                />
              </label>
              <div className="text-xs font-medium">
                Total línea
                <output className="mt-1.5 flex min-h-[42px] items-center rounded-xl border bg-white px-3 py-2.5 text-sm font-bold">
                  {clp.format(totals[index])}
                </output>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <div className="min-w-72 rounded-2xl bg-[var(--oasis-primary-dark)] p-4 text-white">
          <span className="text-sm text-white/70">
            Monto total de la factura
          </span>
          <strong className="mt-1 block text-2xl">
            {clp.format(invoiceTotal)}
          </strong>
        </div>
      </div>
    </section>
  );
}
