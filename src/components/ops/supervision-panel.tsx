import Link from "next/link";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { drawAuditAction } from "@/modules/lodging/application/ops-actions";
import {
  complianceLabels,
  complianceLight,
  weekTotals,
  type AuditWeekSummary,
  type SupervisionAlert,
} from "@/modules/lodging/domain/audits";

const lightTone = {
  ok: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-900",
  pending: "bg-red-50 text-red-800",
} as const;
const lightIcon = { ok: "✓", warning: "!", pending: "✕" } as const;
const alertTone = { critical: "border-red-300 bg-red-50 text-red-900", warning: "border-amber-300 bg-amber-50 text-amber-900", info: "border-blue-200 bg-blue-50 text-blue-900" } as const;
const shortName = (name: string) => name.replace(/^Hostal\s+(Oasis\s+)?/i, "");
const ddmm = (d: string) => `${d.slice(8)}-${d.slice(5, 7)}`;

/** Supervisión en /ops: auditorías de la semana por hostal, total y alertas. */
export function SupervisionPanel({ week, alerts, canAudit }: { week: AuditWeekSummary; alerts: SupervisionAlert[]; canAudit: boolean }) {
  const totals = weekTotals(week.units);
  const totalLight = complianceLight(totals.compliance);
  return (
    <section className="mb-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Auditorías de la semana</h2>
        <span className="text-xs text-slate-500">
          {ddmm(week.week_start)} al {ddmm(week.week_end)}
        </span>
      </div>

      {week.units.map((u) => {
        const light = complianceLight(u.compliance, u.ok_pct, u.warning_pct);
        return (
          <article key={u.id} className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold">{shortName(u.name)}</h3>
                <p className="text-sm text-slate-600">
                  {u.cleaned} limpieza{u.cleaned === 1 ? "" : "s"} · {u.conformity === null ? "sin auditorías" : `${u.conformity}% conformes`}
                  {u.failed ? ` · ${u.failed} fallida(s)` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">
                  {u.done} / {u.target}
                </p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${lightTone[light]}`}>
                  <span aria-hidden>{lightIcon[light]}</span> {complianceLabels[light]}
                </span>
              </div>
            </div>
            {canAudit &&
              (u.open_audit ? (
                <Link href={`/ops/audit/${u.open_audit}`} className="mt-3 flex h-12 items-center justify-center rounded-2xl bg-[#0b2f5f] text-sm font-bold text-white">
                  CONTINUAR AUDITORÍA
                </Link>
              ) : (
                <form action={drawAuditAction} className="mt-3">
                  <input type="hidden" name="unit_id" value={u.id} />
                  <OpsSubmit className="h-12 bg-[#0b2f5f] text-sm text-white">REALIZAR AUDITORÍA</OpsSubmit>
                </form>
              ))}
          </article>
        );
      })}

      {week.units.length > 1 && (
        <div className="flex items-center justify-between rounded-2xl bg-[#0b2f5f] px-4 py-3 text-white">
          <span className="font-bold">TOTAL</span>
          <span className="flex items-center gap-2">
            <b className="text-xl tabular-nums">
              {totals.done} / {totals.target}
            </b>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${lightTone[totalLight]}`}>{totals.compliance}%</span>
          </span>
        </div>
      )}

      {alerts.length > 0 && (
        <div>
          <h2 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Requiere atención</h2>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${alertTone[a.level]}`}>
                {a.level === "critical" ? "⚠ " : a.level === "warning" ? "! " : "ℹ "}
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/ops/audits" className="block rounded-2xl border bg-white px-4 py-3 text-center text-sm font-bold text-[#0b4f9c]">
        Indicadores del mes e histórico →
      </Link>
    </section>
  );
}
