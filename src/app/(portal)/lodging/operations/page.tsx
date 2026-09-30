import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { AttentionList } from "@/components/ops/attention-list";
import { lodgingUnitCodes } from "@/config/business-units";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadOperationsDashboard } from "@/modules/lodging/application/operations-dashboard";
import { roomAttention, shortUnitName, sortAttention } from "@/modules/lodging/domain/attention";
import { failureCategories } from "@/modules/lodging/domain/audits";
import { incidentPriorities, isBlocking, isOpen } from "@/modules/lodging/domain/incidents";
import { arrivalLabel, operationalStatusColors, operationalStatusLabels, statusCounts, type OpsRoom } from "@/modules/lodging/domain/operations";
import { combineTotals, pct, periodLabels, periodRange, roomPriority, sinceLabel, type Period } from "@/modules/lodging/domain/ops-kpis";

const minutes = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n} min`);
const santiagoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: OpsRoom["operational_status"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-700">
      <span className="h-3.5 w-1.5 rounded-full" style={{ background: operationalStatusColors[status] }} />
      {operationalStatusLabels[status]}
    </span>
  );
}

const pill = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold ${active ? "bg-[#0b4f9c] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

/**
 * Vista ejecutiva de la operación de hostales (gerencia y administración):
 * estado de cada habitación, qué requiere atención, incidencias y tiempos de
 * aseo e inspección del período. En computador se ve en tablas; en el
 * celular, en tarjetas.
 */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ period?: string; scope?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.operations.kpis");
  const lodgingUnits = ctx.units.filter((u) => lodgingUnitCodes.includes(u.code));
  const multi = ctx.permissions.has("lodging.operations.multi_unit") && lodgingUnits.length > 1;
  const scope = multi && q.scope !== "unit" ? "all" : "unit";
  const unitIds = scope === "all" ? lodgingUnits.map((u) => u.id) : [unit.id];
  const period: Period = q.period === "week" || q.period === "month" ? q.period : "today";
  const today = santiagoToday();
  const { from, to } = periodRange(period, today);
  const { boards, kpis, incidents } = await loadOperationsDashboard(supabase, unitIds, from, to);
  const now = new Date();

  const rooms = boards
    .flatMap((b) => b.rooms.map((r) => ({ ...r, unitId: b.unit.id, unitName: shortUnitName(b.unit.name), today: b.today })))
    .sort(roomPriority);
  const counts = statusCounts(rooms);
  const sellable = rooms.length - counts.maintenance - counts.out_of_service;
  const withProblem = rooms.filter((r) => r.operational_status === "maintenance" || r.operational_status === "out_of_service" || (r.incidents?.open ?? 0) > 0).length;
  const totals = combineTotals(kpis);
  const attention = sortAttention(boards.flatMap((b) => roomAttention(b, now)));
  const openIncidents = incidents.filter((i) => isOpen(i.status));
  const lastCleaning = new Map(kpis.flatMap((k) => k.by_room.map((r) => [r.id, r] as const)));
  const unitName = (id: string) => shortUnitName(lodgingUnits.find((u) => u.id === id)?.name ?? "");
  const showUnit = scope === "all";
  const href = (p: Partial<{ period: string; scope: string }>) => {
    const params = new URLSearchParams({ period, ...(multi ? { scope } : {}), ...p });
    return `/lodging/operations?${params}`;
  };
  const inspectedPct = pct(counts.inspected, sellable);

  return (
    <>
      <PageHeader
        eyebrow={scope === "all" ? "Todos los hostales" : unit.name}
        title="Operación de hostales"
        description="Estado de las habitaciones, lo que requiere atención y los tiempos de aseo e inspección. Se actualiza con lo que aseo y recepción registran en el portal operativo."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(Object.keys(periodLabels) as Period[]).map((p) => (
          <Link key={p} href={href({ period: p })} className={pill(period === p)}>
            {periodLabels[p]}
          </Link>
        ))}
        {multi && (
          <span className="ml-auto flex gap-2">
            <Link href={href({ scope: "all" })} className={pill(scope === "all")}>
              Todos los hostales
            </Link>
            <Link href={href({ scope: "unit" })} className={pill(scope === "unit")}>
              {shortUnitName(unit.name)}
            </Link>
          </span>
        )}
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Ahora</p>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Listas (inspeccionadas)"
          value={`${counts.inspected} / ${sellable}`}
          hint={inspectedPct === null ? undefined : `${inspectedPct}% de las habitaciones en venta`}
          tone={inspectedPct !== null && inspectedPct >= 80 ? "good" : "warn"}
        />
        <Tile label="Por limpiar" value={String(counts.dirty)} tone={counts.dirty ? "bad" : "good"} />
        <Tile label="En limpieza" value={String(counts.cleaning)} />
        <Tile label="Por inspeccionar" value={String(counts.pending_inspection)} tone={counts.pending_inspection ? "warn" : "good"} />
        <Tile label="Con problema" value={String(withProblem)} hint={`${openIncidents.length} incidencia(s) abierta(s)`} tone={withProblem ? "bad" : "good"} />
        <Tile label="Requiere atención" value={String(attention.length)} tone={attention.some((a) => a.level === "critical") ? "bad" : attention.length ? "warn" : "good"} />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {periodLabels[period]} {from !== to ? `· ${from.slice(8)}-${from.slice(5, 7)} al ${to.slice(8)}-${to.slice(5, 7)}` : ""}
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Limpiezas" value={String(totals.cleanings)} hint={totals.rework ? `${totals.rework} retrabajo(s)` : "Sin retrabajos"} />
        <Tile label="Tiempo promedio de aseo" value={minutes(totals.avgMinutes)} hint={totals.maxMinutes ? `Máximo ${totals.maxMinutes} min` : undefined} />
        <Tile
          label="Aprobadas a la primera"
          value={totals.approvedFirstPct === null ? "—" : `${totals.approvedFirstPct}%`}
          hint={`${totals.rejected} rechazo(s) de recepción`}
          tone={totals.approvedFirstPct === null ? undefined : totals.approvedFirstPct >= 90 ? "good" : totals.approvedFirstPct >= 75 ? "warn" : "bad"}
        />
        <Tile label="Espera de inspección" value={minutes(totals.avgWaitMinutes)} hint="Desde que aseo termina hasta que recepción inspecciona" />
      </div>

      <div className="mb-6 space-y-5">
        <Panel className="min-w-0 p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Estado de las habitaciones</h2>
            <span className="text-xs text-slate-500">{rooms.length} habitaciones · primero lo que requiere acción</span>
          </div>
          {/* Computador: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Habitación</th>
                  <th className="px-3">Estado</th>
                  <th className="px-3">Desde hace</th>
                  <th className="px-3">Responsable</th>
                  <th className="px-3">Próxima llegada</th>
                  <th className="px-3">Incidencias</th>
                  <th className="px-3 text-right">Último aseo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((r) => {
                  const last = lastCleaning.get(r.id);
                  const who =
                    r.operational_status === "cleaning"
                      ? r.task?.started_by_name ?? "—"
                      : r.operational_status === "pending_inspection" && r.awaiting
                        ? `Terminó ${r.awaiting.completed_by_name ?? ""}`.trim()
                        : "—";
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-5 py-2.5">
                        <Link href={`/ops/room/${r.id}`} className="font-semibold text-slate-800 hover:underline">
                          {r.name}
                        </Link>
                        {showUnit && <span className="block text-xs text-slate-500">{r.unitName}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={r.operational_status} />
                        {r.rework && r.operational_status === "dirty" && <span className="block text-xs text-red-700">Retrabajo</span>}
                        {r.occupied && <span className="block text-xs text-slate-500">Ocupada</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-700">{sinceLabel(r.status_changed_at, now)}</td>
                      <td className="px-3 py-2.5 text-slate-700">{who}</td>
                      <td className="px-3 py-2.5 text-slate-700">{arrivalLabel(r, r.today)}</td>
                      <td className="px-3 py-2.5">
                        {r.incidents?.open ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.incidents.blocking ? "bg-red-600 text-white" : "bg-orange-100 text-orange-900"}`}>
                            {r.incidents.open} {r.incidents.blocking ? "· bloquea" : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{minutes(last?.last_minutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Celular: tarjetas */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {rooms.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderLeft: `4px solid ${operationalStatusColors[r.operational_status]}` }}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {r.name} {showUnit && <span className="text-xs font-normal text-slate-500">· {r.unitName}</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    {operationalStatusLabels[r.operational_status]} hace {sinceLabel(r.status_changed_at, now)}
                    {r.operational_status === "cleaning" && r.task?.started_by_name ? ` · ${r.task.started_by_name}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">Llegada: {arrivalLabel(r, r.today)}</p>
                </div>
                {r.incidents?.open ? (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.incidents.blocking ? "bg-red-600 text-white" : "bg-orange-100 text-orange-900"}`}>
                    ⚠ {r.incidents.open}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <Panel>
            <AttentionList items={attention} currentUnitId={unit.id} showUnit={showUnit} limit={10} />
          </Panel>
          <Panel>
            <h2 className="mb-3 font-semibold">Incidencias abiertas · {openIncidents.length}</h2>
            {!openIncidents.length ? (
              <p className="text-sm text-slate-500">Sin incidencias abiertas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {openIncidents.slice(0, 12).map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2">
                    <Link href={`/ops/incidents/${i.id}`} className="min-w-0 hover:underline">
                      <b>{i.room_name ?? "Áreas comunes"}</b>
                      {showUnit ? <span className="text-slate-500"> · {unitName(i.unit_id)}</span> : null} · {failureCategories[i.category]}
                      <span className="block truncate text-xs text-slate-500">
                        {sinceLabel(i.created_at, now)} · {i.assigned_to ? `asignada a ${i.assigned_to}` : "sin asignar"}
                        {isBlocking(i) ? " · bloquea la habitación" : ""}
                      </span>
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        i.priority === "critical" ? "bg-red-100 text-red-800" : i.priority === "high" ? "bg-orange-100 text-orange-900" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {incidentPriorities[i.priority]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Panel className="min-w-0">
          <h2 className="mb-1 font-semibold">Tiempo de aseo por habitación</h2>
          <p className="mb-3 text-xs text-slate-500">{periodLabels[period]}. Retrabajos: limpiezas repetidas por rechazo o auditoría.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2">Habitación</th>
                  <th className="text-right">Limpiezas</th>
                  <th className="text-right">Promedio</th>
                  <th className="text-right">Máximo</th>
                  <th className="text-right">Retrabajos</th>
                  <th className="text-right">Rechazos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {kpis.flatMap((k) =>
                  k.by_room.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2">
                        {r.name}
                        {showUnit && <span className="text-xs text-slate-500"> · {shortUnitName(k.unit.name)}</span>}
                      </td>
                      <td className="text-right">{r.cleanings}</td>
                      <td className="text-right">{minutes(r.avg_minutes)}</td>
                      <td className="text-right">{minutes(r.max_minutes)}</td>
                      <td className={`text-right ${r.rework ? "font-semibold text-amber-700" : ""}`}>{r.rework}</td>
                      <td className={`text-right ${r.rejected ? "font-semibold text-red-700" : ""}`}>{r.rejected}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel className="min-w-0">
            <h2 className="mb-1 font-semibold">Aseo por persona</h2>
            <p className="mb-3 text-xs text-slate-500">Para mejorar el proceso y capacitar, no para sancionar.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">Persona</th>
                    <th className="text-right">Limpiezas</th>
                    <th className="text-right">Promedio</th>
                    <th className="text-right">Rechazadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {kpis.flatMap((k) =>
                    k.by_person.map((p) => (
                      <tr key={`${k.unit.id}-${p.id}`}>
                        <td className="py-2">
                          {p.name}
                          {showUnit && <span className="text-xs text-slate-500"> · {shortUnitName(k.unit.name)}</span>}
                        </td>
                        <td className="text-right">{p.cleanings}</td>
                        <td className="text-right">{minutes(p.avg_minutes)}</td>
                        <td className="text-right">
                          {p.rejected}
                          {p.inspected ? <span className="text-xs text-slate-500"> ({pct(p.rejected, p.inspected)}%)</span> : null}
                        </td>
                      </tr>
                    )),
                  )}
                  {!kpis.some((k) => k.by_person.length) && (
                    <tr>
                      <td colSpan={4} className="py-3 text-slate-500">
                        Sin limpiezas registradas en el período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="min-w-0">
            <h2 className="mb-3 font-semibold">Inspección de recepción</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">Recepcionista</th>
                    <th className="text-right">Inspecciones</th>
                    <th className="text-right">Rechazos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {kpis.flatMap((k) =>
                    k.by_inspector.map((p) => (
                      <tr key={`${k.unit.id}-${p.id}`}>
                        <td className="py-2">{p.name}</td>
                        <td className="text-right">{p.inspections}</td>
                        <td className="text-right">{p.rejected}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Motivos de rechazo</p>
                {kpis.some((k) => k.rejection_reasons.length) ? (
                  <ul className="space-y-1 text-sm">
                    {kpis
                      .flatMap((k) => k.rejection_reasons)
                      .reduce<{ reason: string; n: number }[]>((acc, r) => {
                        const found = acc.find((a) => a.reason === r.reason);
                        if (found) found.n += r.n;
                        else acc.push({ ...r });
                        return acc;
                      }, [])
                      .sort((a, b) => b.n - a.n)
                      .map((r) => (
                        <li key={r.reason} className="flex justify-between gap-2">
                          <span>{r.reason}</span>
                          <b className="tabular-nums">{r.n}</b>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin rechazos en el período.</p>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
