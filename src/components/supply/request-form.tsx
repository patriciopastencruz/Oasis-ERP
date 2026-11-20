"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type CatalogItem = { id: string; code: string; name: string; category: string; unit: string };
type Project = { id: string; project_number: string | null; name: string; place: string | null };
export type FormRow = { key: string; materialId: string; customName: string; unit: string; quantity: string; note: string };

const OTHER = "__other";
const input = "mt-1 block w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-3 text-base outline-none focus:border-[var(--oasis-primary)]";

let counter = 0;
const emptyRow = (): FormRow => ({ key: `r${Date.now()}-${counter++}`, materialId: "", customName: "", unit: "", quantity: "", note: "" });

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
                  <select
                    aria-label={`Material ${index + 1}`}
                    value={row.materialId}
                    onChange={(e) => patch(row.key, { materialId: e.target.value, unit: byId.get(e.target.value)?.unit ?? row.unit })}
                    className={input.replace("mt-1 ", "")}
                  >
                    <option value="">Elige un material…</option>
                    {categories.map((category) => (
                      <optgroup key={category} label={category}>
                        {catalog
                          .filter((m) => m.category === category)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    <option value={OTHER}>Otro (no está en la lista)…</option>
                  </select>
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

      <SubmitButton updating={mode === "update"} />
    </form>
  );
}
