"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type CatalogItem = { id: string; code: string; name: string; category: string; unit: string };
type Project = { id: string; project_number: string | null; name: string; place: string | null };
export type FormRow = { key: string; materialId: string; customName: string; unit: string; quantity: string; note: string };

const OTHER = "__other";
const input = "mt-1 block w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-3 text-base outline-none focus:border-[var(--oasis-primary)]";

let counter = 0;
const emptyRow = (): FormRow => ({ key: `r${Date.now()}-${counter++}`, materialId: "", customName: "", unit: "", quantity: "", note: "" });

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const MAX_RESULTS = 60;

/** Selector de material para el celular: pantalla completa con búsqueda por texto y filtro por categoría. */
function MaterialPicker({
  catalog,
  categories,
  onPick,
  onClose,
}: {
  catalog: CatalogItem[];
  categories: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const matches = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return catalog.filter((m) => (!category || m.category === category) && words.every((w) => fold(`${m.name} ${m.category}`).includes(w)));
  }, [catalog, query, category]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Elegir material" style={{ margin: 0 }} className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="space-y-2 border-b px-3 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            type="search"
            aria-label="Buscar material"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar material (ej: perfil 50, tornillo, pintura)"
            className="block w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-3 text-base outline-none focus:border-[var(--oasis-primary)]"
          />
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl px-3 py-3 text-sm font-semibold text-[#0b4f9c]">
            Cerrar
          </button>
        </div>
        <select
          aria-label="Filtrar por categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="block w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-3 text-base outline-none focus:border-[var(--oasis-primary)]"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <ul className="flex-1 divide-y overflow-y-auto overscroll-contain">
        {matches.slice(0, MAX_RESULTS).map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onPick(m.id)} className="block w-full px-4 py-3 text-left active:bg-slate-100">
              <span className="block text-base font-medium leading-snug">{m.name}</span>
              <span className="block text-xs text-slate-500">
                {m.category} · {m.unit}
              </span>
            </button>
          </li>
        ))}
        {matches.length > MAX_RESULTS && (
          <li className="px-4 py-3 text-center text-sm text-slate-500">Hay {matches.length - MAX_RESULTS} más: escribe para acotar la búsqueda.</li>
        )}
        {matches.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No encontramos ese material. Prueba con otra palabra o elige «Otro».</li>}
      </ul>
      <div className="border-t p-3">
        <button type="button" onClick={() => onPick(OTHER)} className="w-full rounded-xl border border-[#d5dce4] px-4 py-3 text-base font-semibold text-slate-700">
          Otro (no está en la lista)
        </button>
      </div>
    </div>
  );
}

function SubmitButton({ updating }: { updating: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 -mx-1 border-t bg-white/95 px-1 py-3 backdrop-blur">
      <button disabled={pending} className="w-full rounded-xl bg-[#0b4f9c] px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60">
        {pending ? "Enviando…" : updating ? "Guardar cambios" : "Enviar a bodega"}
      </button>
    </div>
  );
}

/** Pedido de materiales pensado para el celular: elegir material y cantidad. Lo demás está en «Más opciones». */
export function RequestForm({
  action,
  catalog,
  projects,
  today,
  initial,
  mode = "send",
}: {
  action: (form: FormData) => void | Promise<void>;
  catalog: CatalogItem[];
  projects: Project[];
  today: string;
  mode?: "send" | "update";
  initial: {
    requestId?: string;
    projectId?: string;
    from: string;
    to: string;
    urgent?: boolean;
    urgentReason?: string;
    notes?: string;
    rows?: FormRow[];
  };
}) {
  const [rows, setRows] = useState<FormRow[]>(initial.rows?.length ? initial.rows : [emptyRow(), emptyRow(), emptyRow()]);
  const [urgent, setUrgent] = useState(Boolean(initial.urgent));
  const [withNote, setWithNote] = useState(() => new Set((initial.rows ?? []).filter((r) => r.note).map((r) => r.key)));
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const categories = [...new Set(catalog.map((m) => m.category))];

  const patch = (key: string, change: Partial<FormRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const linesJson = JSON.stringify(
    rows.map((r) => ({
      material_id: r.materialId === OTHER ? "" : r.materialId,
      custom_name: r.materialId === OTHER ? r.customName : "",
      unit: r.unit,
      quantity: r.quantity,
      note: r.note,
    })),
  );

  return (
    <form action={action} className="space-y-5">
      {initial.requestId && <input type="hidden" name="request_id" value={initial.requestId} />}
      <input type="hidden" name="lines_json" value={linesJson} />
      <input type="hidden" name="mode" value={mode} />

      <section className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
        {projects.length === 1 ? (
          <>
            <input type="hidden" name="project_id" value={projects[0].id} />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proyecto</p>
            <p className="font-semibold">{[projects[0].project_number, projects[0].name].filter(Boolean).join(" · ")}</p>
          </>
        ) : (
          <label className="block text-sm font-medium">
            Proyecto
            <select name="project_id" required defaultValue={initial.projectId ?? ""} className={input}>
              <option value="">Elige tu proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.project_number, p.name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Materiales</h2>
        {rows.map((row, index) => {
          const material = byId.get(row.materialId);
          const other = row.materialId === OTHER;
          return (
            <div key={row.key} className="space-y-2 rounded-2xl border border-[#d9dfe6] bg-white p-3">
              <div className="flex items-start gap-2">
                <span className="mt-3 w-5 shrink-0 text-center text-sm font-semibold text-slate-400">{index + 1}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <button
                    type="button"
                    aria-label={`Material ${index + 1}`}
                    onClick={() => setPickingFor(row.key)}
                    className={`${input.replace("mt-1 ", "")} flex items-center justify-between gap-2 text-left`}
                  >
                    <span className={`min-w-0 flex-1 ${material || other ? "font-medium" : "text-slate-500"}`}>
                      {material ? material.name : other ? "Otro (no está en la lista)" : "Buscar material…"}
                    </span>
                    <span aria-hidden className="shrink-0 text-slate-400">
                      ⌕
                    </span>
                  </button>
                  {other && (
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        aria-label="Nombre del material"
                        value={row.customName}
                        onChange={(e) => patch(row.key, { customName: e.target.value })}
                        placeholder="Nombre del material"
                        maxLength={160}
                        className={`${input.replace("mt-1 ", "")} col-span-2`}
                      />
                      <input
                        aria-label="Unidad"
                        value={row.unit}
                        onChange={(e) => patch(row.key, { unit: e.target.value })}
                        placeholder="Unidad"
                        maxLength={40}
                        className={input.replace("mt-1 ", "")}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`Cantidad ${index + 1}`}
                      value={row.quantity}
                      onChange={(e) => patch(row.key, { quantity: e.target.value })}
                      inputMode="decimal"
                      placeholder="Cantidad"
                      className={`${input.replace("mt-1 ", "")} max-w-[9rem]`}
                    />
                    <span className="text-sm text-slate-500">{material?.unit ?? (other ? row.unit : "")}</span>
                  </div>
                  {withNote.has(row.key) ? (
                    <input
                      aria-label={`Nota ${index + 1}`}
                      value={row.note}
                      onChange={(e) => patch(row.key, { note: e.target.value })}
                      placeholder="Nota (medida, color…)"
                      maxLength={300}
                      className={`${input.replace("mt-1 ", "")} text-sm`}
                    />
                  ) : (
                    <button type="button" onClick={() => setWithNote((all) => new Set(all).add(row.key))} className="text-xs font-semibold text-[#0b4f9c]">
                      + Agregar nota
                    </button>
                  )}
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                    aria-label={`Quitar fila ${index + 1}`}
                    className="mt-1 rounded-lg px-2.5 py-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setRows((all) => [...all, emptyRow()])}
          className="w-full rounded-xl border border-dashed border-[#0b4f9c] px-4 py-3 text-base font-semibold text-[#0b4f9c]"
        >
          + Agregar otro material
        </button>
      </section>

      <details className="rounded-2xl border border-[#d9dfe6] bg-white p-4" open={urgent || Boolean(initial.notes)}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-[#0b4f9c]">Más opciones (días, urgente, comentario)</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Lo necesito desde
              <input type="date" name="cover_from" required min={today} defaultValue={initial.from} className={input} />
            </label>
            <label className="block text-sm font-medium">
              Hasta
              <input type="date" name="cover_to" required min={today} defaultValue={initial.to} className={input} />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-1 size-5" />
            <span>
              Es urgente
              <span className="block text-xs font-normal text-slate-500">Úsalo solo si falta algo con urgencia; avisa a bodega por correo.</span>
            </span>
          </label>
          {urgent && (
            <input
              name="urgent_reason"
              defaultValue={initial.urgentReason ?? ""}
              maxLength={300}
              placeholder="¿Por qué es urgente?"
              className={input}
            />
          )}
          <label className="block text-sm font-medium">
            Comentario para bodega (opcional)
            <textarea name="notes" defaultValue={initial.notes ?? ""} rows={2} maxLength={1000} className={input} />
          </label>
        </div>
      </details>

      {pickingFor && (
        <MaterialPicker
          catalog={catalog}
          categories={categories}
          onClose={() => setPickingFor(null)}
          onPick={(id) => {
            patch(pickingFor, { materialId: id, unit: byId.get(id)?.unit ?? "" });
            setPickingFor(null);
          }}
        />
      )}

      <SubmitButton updating={mode === "update"} />
    </form>
  );
}
