"use client";

import { useMemo, useState } from "react";
import { PhotoPicker } from "@/components/ops/photo-picker";
import {
  DEFAULT_SERVICE_DETAIL,
  QUOTATION_MAX_LINES,
  QUOTATION_MAX_PHOTOS,
  lineTotals,
  nightsBetween,
  quotationTotals,
} from "@/modules/lodging/domain/quotations";

type Line = { description: string; quantity: string; unit_net: string; nights: string };

const field =
  "mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0b4f9c]";
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function LodgingQuotationForm({
  action,
  defaultAddress,
  roomTypes,
}: {
  action: (form: FormData) => void | Promise<void>;
  defaultAddress: string;
  roomTypes: string[];
}) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: "1", unit_net: "", nights: "1" },
  ]);

  const parsed = useMemo(
    () =>
      lines.map((l) => ({
        description: l.description.trim(),
        quantity: num(l.quantity),
        unit_net: num(l.unit_net),
        nights: num(l.nights),
      })),
    [lines],
  );
  const valid = parsed.map(
    (l) =>
      l.description.length > 0 &&
      Number.isInteger(l.quantity) && l.quantity >= 1 &&
      Number.isInteger(l.unit_net) && l.unit_net >= 0 &&
      Number.isInteger(l.nights) && l.nights >= 1,
  );
  const totals = quotationTotals(parsed.filter((_, i) => valid[i]));

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }
  function syncNights(nextIn: string, nextOut: string) {
    const n = nightsBetween(nextIn, nextOut);
    if (n) setLines((prev) => prev.map((l) => ({ ...l, nights: String(n) })));
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="lines" value={JSON.stringify(parsed)} />

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Empresa</h2>
        <label className="text-sm font-medium sm:col-span-2">
          Empresa *
          <input name="client_company" required minLength={2} maxLength={160} className={field} />
        </label>
        <label className="text-sm font-medium">
          RUT
          <input name="client_rut" maxLength={30} className={field} />
        </label>
        <label className="text-sm font-medium">
          Persona de contacto
          <input name="client_contact" maxLength={160} className={field} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Correo
          <input name="client_email" type="email" maxLength={160} className={field} />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Servicio</h2>
        <label className="text-sm font-medium sm:col-span-2">
          Dirección del hostal (aparece en el PDF)
          <input name="hostel_address" defaultValue={defaultAddress} maxLength={200} placeholder="Ej. Calle Uruguay #2462" className={field} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Detalle del servicio (una viñeta por línea)
          <textarea name="service_detail" rows={3} maxLength={1000} defaultValue={DEFAULT_SERVICE_DETAIL} className={field} />
        </label>
        <label className="text-sm font-medium">
          Entrada (opcional)
          <input
            name="check_in"
            type="date"
            value={checkIn}
            onChange={(e) => {
              setCheckIn(e.target.value);
              syncNights(e.target.value, checkOut);
            }}
            className={field}
          />
        </label>
        <label className="text-sm font-medium">
          Salida (opcional)
          <input
            name="check_out"
            type="date"
            value={checkOut}
            onChange={(e) => {
              setCheckOut(e.target.value);
              syncNights(checkIn, e.target.value);
            }}
            className={field}
          />
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">
          Si indicas las fechas, las noches de cada ítem se calculan solas; igual puedes ajustarlas.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold">Habitaciones</h2>
        <datalist id="room-types">
          {roomTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {lines.map((l, i) => {
          const t = valid[i] ? lineTotals(parsed[i]) : null;
          return (
            <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,2fr)_80px_130px_80px_auto] sm:items-end">
              <label className="text-xs font-medium text-slate-600">
                Descripción
                <input
                  list="room-types"
                  value={l.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="Ej. Habitación baño privado grande"
                  maxLength={200}
                  className={field}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Cantidad
                <input type="number" min={1} max={100} step={1} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className={field} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Valor neto por noche
                <input type="number" min={0} step={1} value={l.unit_net} onChange={(e) => update(i, { unit_net: e.target.value })} className={field} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Noches
                <input type="number" min={1} max={365} step={1} value={l.nights} onChange={(e) => update(i, { nights: e.target.value })} className={field} />
              </label>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="text-sm font-semibold text-slate-800">{t ? clp.format(t.total) : "—"}</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, k) => k !== i))}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                    aria-label="Quitar ítem"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {lines.length < QUOTATION_MAX_LINES && (
          <button
            type="button"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { description: "", quantity: "1", unit_net: "", nights: prev[prev.length - 1]?.nights ?? "1" },
              ])
            }
            className="w-fit rounded-xl border border-[#0b4f9c] px-4 py-2 text-sm font-semibold text-[#0b4f9c]"
          >
            + Agregar habitación
          </button>
        )}
        <dl className="ml-auto grid w-full gap-1 text-sm sm:w-72">
          <div className="flex justify-between"><dt className="text-slate-500">Neto</dt><dd>{clp.format(totals.net)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">IVA (19%)</dt><dd>{clp.format(totals.iva)}</dd></div>
          <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Total</dt><dd>{clp.format(totals.total)}</dd></div>
        </dl>
        <p className="text-xs text-slate-500">
          El valor se ingresa neto (sin IVA). Los totales definitivos los calcula el sistema al emitir.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Fotos de la habitación (opcional)</h2>
        <PhotoPicker name="photos" max={QUOTATION_MAX_PHOTOS} />
      </section>

      <button
        disabled={!valid.every(Boolean)}
        className="rounded-xl bg-[#0b4f9c] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Emitir cotización
      </button>
    </form>
  );
}
