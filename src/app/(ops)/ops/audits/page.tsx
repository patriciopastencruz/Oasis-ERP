import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAuditMonth, loadAuditWeek, opsContext } from "@/modules/lodging/application/ops-queries";
import {
  complianceLabels,
  complianceLight,
  failureCategories,
  responsibilityLabels,
  weekTotals,
  type Responsibility,
} from "@/modules/lodging/domain/audits";

const shortName = (name: string) => name.replace(/^Hostal\s+(Oasis\s+)?/i, "");
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const shiftMonth = (m: string, n: number) => {
  const x = new Date(`${m}-01T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 7);
};
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const lightTone = { ok: "bg-emerald-50 text-emerald-800", warning: "bg-amber-50 text-amber-900", pending: "bg-red-50 text-red-800" } as const;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/** Indicadores de supervisión: semana (todos los hostales) y tendencias del mes (hostal seleccionado). */
export default async function AuditsPage({ searchParams }: { searchParams: Promise<{ week?: string; month?: string }> }) {
  const q = await searchParams;
  const { unit, can, supabase } = await opsContext();
  if (!can.auditView) redirect("/ops");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const week = await loadAuditWeek(supabase, /^\d{4}-\d{2}-\d{2}$/.test(q.week ?? "") ? q.week : undefined);
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") && q.month! <= today.slice(0, 7) ? q.month! : today.slice(0, 7);
  const kpis = await loadAuditMonth(supabase, unit.id, month);
  const totals = weekTotals(week.units);
  const catMax = Math.max(1, ...kpis.categories.map((c) => c.count));

  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <h1 className="mb-3 text-xl font-bold">Indicadores de supervisión</h1>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Semana</h2>
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/ops/audits?week=${addDays(week.week_start, -7)}&month=${month}`} className="rounded-full bg-white px-3 py-1 shadow-sm">‹</Link>
            <span className="font-semibold">
              {week.week_start.slice(8)}-{week.week_start.slice(5, 7)} al {week.week_end.slice(8)}-{week.week_end.slice(5, 7)}
            </span>
            {addDays(week.week_start, 7) <= today && (
              <Link href={`/ops/audits?week=${addDays(week.week_start, 7)}&month=${month}`} className="rounded-full bg-white px-3 py-1 shadow-sm">›</Link>
            )}
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Hostal</th>
                <th className="text-right">Meta</th>
                <th className="text-right">Hechas</th>
                <th className="text-right">Pend.</th>
                <th className="text-right">Aprob.</th>
                <th className="text-right">Fall.</th>
                <th className="text-right">Hallazgos</th>
                <th className="text-right">Incid.</th>
                <th className="px-3 text-right">Cumpl.</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {week.units.map((u) => {
                const light = complianceLight(u.compliance, u.ok_pct, u.warning_pct);
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{shortName(u.name)}</td>
                    <td className="text-right">{u.target}</td>
                    <td className="text-right">{u.done}</td>
                    <td className="text-right">{u.pending}</td>
                    <td className="text-right">{u.passed}</td>
                    <td className="text-right">{u.failed}</td>
                    <td className="text-right">{u.findings}</td>
                    <td className="text-right">{u.incidents}</td>
                    <td className="px-3 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${lightTone[light]}`} title={complianceLabels[light]}>
                        {u.compliance}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {week.units.length > 1 && (
                <tr className="border-t-2 font-bold">
                  <td className="px-3 py-2">Total</td>
                  <td className="text-right">{totals.target}</td>
                  <td className="text-right">{totals.done}</td>
                  <td className="text-right">{totals.pending}</td>
                  <td className="text-right">{totals.passed}</td>
                  <td className="text-right">{totals.failed}</td>
                  <td colSpan={2} />
                  <td className="px-3 text-right">{totals.compliance}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Meta = máx(mínimo, % de las limpiezas de la semana), sin superar las habitaciones limpiadas. Cumplimiento = hechas / meta.</p>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{shortName(unit.name)} · mes</h2>
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/ops/audits?month=${shiftMonth(month, -1)}`} className="rounded-full bg-white px-3 py-1 shadow-sm">‹</Link>
            <span className="font-semibold capitalize">
              {monthNames[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
            </span>
            {month < today.slice(0, 7) && (
              <Link href={`/ops/audits?month=${shiftMonth(month, 1)}`} className="rounded-full bg-white px-3 py-1 shadow-sm">›</Link>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Auditorías" value={String(kpis.audits)} hint={`${kpis.passed} aprobadas · ${kpis.failed} fallidas`} />
          <Stat label="% aprobadas" value={kpis.passed_pct === null ? "—" : `${kpis.passed_pct}%`} hint={kpis.failed_pct === null ? undefined : `${kpis.failed_pct}% fallidas`} />
          <Stat label="Recepción vs supervisor" value={String(kpis.reception_discrepancy)} hint="aprobadas por recepción que fallaron" />
          <Stat label="Retrabajos" value={String(kpis.reworks)} hint="limpiezas rehechas tras rechazo" />
          <Stat
            label="Rechazos de recepción"
            value={kpis.inspections_total ? `${Math.round((100 * kpis.inspections_rejected) / kpis.inspections_total)}%` : "—"}
            hint={`${kpis.inspections_rejected} de ${kpis.inspections_total} inspecciones`}
          />
          <Stat label="Reincidentes" value={String(kpis.recurrent.length)} hint="habitaciones con 2+ fallas en 60 días" />
        </div>

        {kpis.failed > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Categorías más frecuentes</h3>
              <ul className="space-y-2 text-sm">
                {kpis.categories.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between">
                      <span>{failureCategories[c.category] ?? c.category}</span>
                      <b className="tabular-nums">
                        {c.count} <span className="font-normal text-slate-400">(mes ant. {c.previous})</span>
                      </b>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-[#ec835a]" style={{ width: `${(100 * c.count) / catMax}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Origen de las fallas</h3>
              <ul className="space-y-1 text-sm">
                {(Object.entries(kpis.by_responsibility) as [Responsibility, number][]).map(([k, n]) => (
                  <li key={k} className="flex justify-between">
                    <span>{responsibilityLabels[k]}</span>
                    <b>{n}</b>
                  </li>
                ))}
              </ul>
              <h3 className="mb-2 mt-4 text-xs font-bold uppercase text-slate-500">Habitaciones con más fallas</h3>
              <ul className="space-y-1 text-sm">
                {kpis.rooms.slice(0, 5).map((r) => (
                  <li key={r.room_id} className="flex justify-between">
                    <Link href={`/ops/room/${r.room_id}`} className="text-[#0b4f9c] underline">
                      {r.room}
                    </Link>
                    <b>{r.failed}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-3 rounded-2xl bg-white shadow-sm">
          <h3 className="px-4 pt-3 text-xs font-bold uppercase text-slate-500">Últimas auditorías</h3>
          {kpis.recent.length ? (
            <ul className="divide-y text-sm">
              {kpis.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <Link href={`/ops/room/${r.room_id}`} className="font-semibold text-[#0b4f9c] underline">
                    {r.room}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit" }).format(new Date(r.at))}
                    {r.category ? ` · ${failureCategories[r.category]}` : ""}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "passed" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                    {r.status === "passed" ? "✓ Aprobada" : "✕ Fallida"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 pt-2 text-sm text-slate-500">Sin auditorías en el mes.</p>
          )}
        </div>
      </section>
    </>
  );
}
