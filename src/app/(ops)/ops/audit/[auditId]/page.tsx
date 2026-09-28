import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { loadAudit, opsContext } from "@/modules/lodging/application/ops-queries";
import { skipAuditAction, submitAuditAction } from "@/modules/lodging/application/ops-actions";
import {
  auditActionLabels,
  auditChecklist,
  auditMarkLabels,
  failureCategories,
  responsibilityLabels,
  severityLabels,
  skipReasons,
  type AuditMark,
} from "@/modules/lodging/domain/audits";

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const markTone: Record<AuditMark, string> = {
  ok: "has-[:checked]:bg-emerald-600 has-[:checked]:text-white",
  observation: "has-[:checked]:bg-amber-500 has-[:checked]:text-white",
  fail: "has-[:checked]:bg-red-600 has-[:checked]:text-white",
};
const resultLabel = { passed: "✓ Aprobada", failed: "✕ Fallida", skipped: "Descartada", in_progress: "En curso" } as const;

/** Auditoría del supervisor de la habitación seleccionada por el sistema. */
export default async function AuditPage({ params, searchParams }: { params: Promise<{ auditId: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ auditId }, q] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(auditId).success) notFound();
  const { ctx, can, supabase } = await opsContext();
  if (!can.auditView) redirect("/ops");
  const a = await loadAudit(supabase, auditId);
  if (!a) notFound();
  const editable = a.status === "in_progress" && a.supervisor_id === ctx.user.id && can.audit;

  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <div className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Auditoría de supervisión</p>
        <h1 className="text-2xl font-bold">{a.room_name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Limpió: <b>{a.housekeeper ?? "—"}</b>
          {a.cleaned_at ? ` · ${hhmm(a.cleaned_at)}` : ""}
          {a.duration_minutes !== null ? ` · ${a.duration_minutes} min` : ""}
        </p>
        <p className="text-sm text-slate-600">
          Inspeccionó: <b>{a.inspector ?? "—"}</b>
          {a.inspected_at ? ` · ${hhmm(a.inspected_at)}` : ""}
        </p>
        {!editable && <p className="mt-2 text-sm font-bold">{resultLabel[a.status]}</p>}
        {a.occupied_now && editable && <p className="mt-2 text-sm font-semibold text-amber-800">⚠ La habitación ahora tiene un huésped: descártala y elige otra.</p>}
      </div>
      {q.error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{q.error}</p>}

      {editable ? (
        <>
          <form action={submitAuditAction} className="group rounded-3xl bg-white p-4 shadow-sm">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="space-y-2">
              {auditChecklist.map(([key, label]) => (
                <fieldset key={key} className="rounded-2xl border p-2">
                  <legend className="px-1 text-sm font-semibold">{label}</legend>
                  <div className="grid grid-cols-3 gap-1">
                    {(["ok", "observation", "fail"] as AuditMark[]).map((m) => (
                      <label key={m} className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold ${markTone[m]}`}>
                        <input type="radio" name={`mark_${key}`} value={m} defaultChecked={m === "ok"} className={`sr-only ${m === "fail" ? "mark-fail" : ""}`} />
                        {auditMarkLabels[m]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <textarea name="notes" maxLength={1000} placeholder="Observaciones (obligatorias si hay una falla)" className="mt-3 w-full rounded-xl border p-3 text-sm" />

            <div className="mt-3 hidden space-y-3 rounded-2xl border border-red-200 bg-red-50/50 p-3 group-has-[.mark-fail:checked]:block">
              <p className="text-sm font-bold text-red-800">Detalle de la falla</p>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">¿De dónde viene la falla?</legend>
                <div className="grid gap-1">
                  {Object.entries(responsibilityLabels).map(([k, v]) => (
                    <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm has-[:checked]:border-red-400">
                      <input type="radio" name="responsibility" value={k} className="size-4 accent-red-600" /> {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">
                  Categoría
                  <select name="category" defaultValue="" className="mt-1 h-11 w-full rounded-xl border bg-white px-2 text-sm">
                    <option value="" disabled>
                      Elegir…
                    </option>
                    {Object.entries(failureCategories).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Gravedad
                  <select name="severity" defaultValue="" className="mt-1 h-11 w-full rounded-xl border bg-white px-2 text-sm">
                    <option value="" disabled>
                      Elegir…
                    </option>
                    {Object.entries(severityLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">Acción</legend>
                <div className="grid gap-1">
                  {Object.entries(auditActionLabels).map(([k, v]) => (
                    <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm has-[:checked]:border-red-400">
                      <input type="radio" name="action" value={k} className="size-4 accent-red-600" /> {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-xs text-slate-500">El registro es para control operacional; no genera sanciones automáticas.</p>
            </div>
            <div className="mt-4">
              <OpsSubmit className="bg-[#0b2f5f] text-white">GUARDAR AUDITORÍA</OpsSubmit>
            </div>
          </form>

          <details className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">No puedo auditar esta habitación</summary>
            <form action={skipAuditAction} className="mt-3 space-y-3">
              <input type="hidden" name="audit_id" value={a.id} />
              <input type="hidden" name="unit_id" value={a.unit_id} />
              <select name="reason" defaultValue="" className="h-12 w-full rounded-xl border bg-white px-3 text-sm">
                <option value="" disabled>
                  Motivo…
                </option>
                {skipReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <OpsSubmit className="bg-slate-600 text-white">DESCARTAR Y ELEGIR OTRA</OpsSubmit>
            </form>
          </details>
        </>
      ) : (
        a.checklist && (
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <ul className="divide-y text-sm">
              {auditChecklist.map(([key, label]) => (
                <li key={key} className="flex justify-between py-2">
                  <span>{label}</span>
                  <b>{auditMarkLabels[(a.checklist?.[key] as AuditMark) ?? "ok"]}</b>
                </li>
              ))}
            </ul>
            {a.notes && <p className="mt-3 text-sm">Observaciones: {a.notes}</p>}
          </div>
        )
      )}
    </>
  );
}
