"use client";
import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_QUOTATION_TERMS,
  IVA_RATE,
  clp,
} from "@/modules/sales/quotations/domain/quotation";
import { inputClass } from "@/modules/sales/ui";

type Line = {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
};

export function QuotationForm({
  action,
  quotationId,
  submitLabel,
  initial,
}: {
  action: (formData: FormData) => void;
  quotationId?: string;
  submitLabel: string;
  initial?: {
    client_company: string;
    client_rut: string;
    client_contact: string;
    client_email: string;
    client_place: string;
    discount: number;
    terms: string;
    lines: { description: string; quantity: number; unit_price: number }[];
  };
}) {
  const nextLineId = useRef((initial?.lines.length ?? 0) + 1);
  const [lines, setLines] = useState<Line[]>(() =>
    initial?.lines.length
      ? initial.lines.map((line, index) => ({ id: index + 1, ...line }))
      : [{ id: 1, description: "", quantity: 1, unit_price: 0 }],
  );
  const [discount, setDiscount] = useState(initial?.discount ?? 0);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
        0,
      ),
    [lines],
  );
  const net = Math.max(0, subtotal - Number(discount || 0));
  const iva = Math.round(net * IVA_RATE);
  const total = net + iva;

  const payload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.description.trim())
          .map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price),
          })),
      ),
    [lines],
  );

  return (
    <form action={action} className="space-y-5">
      {quotationId && (
        <input type="hidden" name="quotation_id" value={quotationId} />
      )}
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="lines" value={payload} />

      <div>
        <h2 className="mb-3 font-semibold">Datos del cliente</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            Empresa
            <input
              className={inputClass}
              name="client_company"
              defaultValue={initial?.client_company}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Rut
            <input
              className={inputClass}
              name="client_rut"
              defaultValue={initial?.client_rut}
            />
          </label>
          <label className="text-sm font-medium">
            Contacto
            <input
              className={inputClass}
              name="client_contact"
              defaultValue={initial?.client_contact}
            />
          </label>
          <label className="text-sm font-medium">
            Correo
            <input
              className={inputClass}
              name="client_email"
              type="email"
              defaultValue={initial?.client_email}
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Lugar
            <input
              className={inputClass}
              name="client_place"
              defaultValue={initial?.client_place}
            />
          </label>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Ítems</legend>
        {lines.map((line, index) => (
          <div
            key={line.id}
            className="grid grid-cols-[1fr_90px_140px_140px_auto] items-start gap-2"
          >
            <textarea
              aria-label={`Descripción ${index + 1}`}
              className={`${inputClass} mt-0`}
              rows={1}
              value={line.description}
              onChange={(e) =>
                setLines((all) =>
                  all.map((x, i) =>
                    i === index ? { ...x, description: e.target.value } : x,
                  ),
                )
              }
              placeholder="Descripción del producto o servicio"
            />
            <input
              aria-label={`Cantidad ${index + 1}`}
              className={`${inputClass} mt-0`}
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
            <input
              aria-label={`Precio ${index + 1}`}
              className={`${inputClass} mt-0`}
              type="number"
              min="0"
              step="1"
              value={line.unit_price}
              onChange={(e) =>
                setLines((all) =>
                  all.map((x, i) =>
                    i === index
                      ? { ...x, unit_price: Number(e.target.value) }
                      : x,
                  ),
                )
              }
            />
            <p className="mt-2.5 text-right text-sm font-semibold">
              {clp.format(
                Number(line.quantity || 0) * Number(line.unit_price || 0),
              )}
            </p>
            <button
              type="button"
              className="mt-1 rounded-xl border px-3 py-2"
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
          onClick={() =>
            setLines((all) => [
              ...all,
              {
                id: nextLineId.current++,
                description: "",
                quantity: 1,
                unit_price: 0,
              },
            ])
          }
        >
          + Agregar ítem
        </button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Descuento (CLP)
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="rounded-xl bg-[var(--oasis-soft)] p-4">
        <div className="grid gap-1 text-sm sm:w-72 sm:ml-auto">
          <div className="flex justify-between">
            <span className="text-[#66776d]">Subtotal</span>
            <span>{clp.format(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#66776d]">Descuento</span>
            <span>{clp.format(Number(discount || 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#66776d]">Neto</span>
            <span>{clp.format(net)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#66776d]">IVA (19%)</span>
            <span>{clp.format(iva)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total</span>
            <span>{clp.format(total)}</span>
          </div>
        </div>
      </div>

      <label className="block text-sm font-medium">
        Términos y condiciones
        <textarea
          className={inputClass}
          name="terms"
          rows={6}
          defaultValue={initial?.terms ?? DEFAULT_QUOTATION_TERMS}
        />
      </label>

      <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
        {submitLabel}
      </button>
    </form>
  );
}
