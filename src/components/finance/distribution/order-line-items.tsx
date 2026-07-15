"use client";
import { useMemo, useState } from "react";
import { inputClass } from "./module-nav";

type Product = { id: string; code: string; name: string; presentation: string };
type Line = { product_id: string; quantity: number };

export function OrderLineItems({
  products,
  initialLines,
}: {
  products: Product[];
  initialLines: Line[];
}) {
  const [lines, setLines] = useState<Line[]>(
    initialLines.length ? initialLines : [{ product_id: "", quantity: 1 }],
  );
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
    <fieldset className="space-y-3">
      <input type="hidden" name="lines" value={payload} />
      <legend className="text-sm font-semibold">Productos</legend>
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
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
      ))}
      <button
        type="button"
        className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2 text-sm text-[var(--oasis-primary)]"
        onClick={() => setLines((x) => [...x, { product_id: "", quantity: 1 }])}
      >
        + Agregar producto
      </button>
    </fieldset>
  );
}
