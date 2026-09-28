import Link from "next/link";
import { redirect } from "next/navigation";
import { BlockChip, PriorityChip, StatusText } from "@/components/ops/incident-chips";
import { loadIncidents, opsContext } from "@/modules/lodging/application/ops-queries";
import { failureCategories } from "@/modules/lodging/domain/audits";
import { incidentAlerts, incidentSources, isBlocking, isOpen, type IncidentItem } from "@/modules/lodging/domain/incidents";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

function Row({ i }: { i: IncidentItem }) {
  return (
    <Link href={`/ops/incidents/${i.id}`} className="block rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">
            {i.room_name ?? "Áreas comunes"} · {failureCategories[i.category]}
          </p>
          <p className="line-clamp-2 text-sm text-slate-600">{i.description}</p>
        </div>
        <PriorityChip priority={i.priority} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <StatusText status={i.status} />
        {isBlocking(i) && <BlockChip kind={i.blocks_room!} />}
        <span>
          {incidentSources[i.source]} · {i.reported_by ?? "—"} · {fmt(i.created_at)}
        </span>
        {i.assigned_to && <span>→ {i.assigned_to}</span>}
        {i.photos > 0 && <span>📷 {i.photos}</span>}
      </div>
    </Link>
  );
}

/** Incidencias del hostal: abiertas por prioridad y resueltas de los últimos 14 días. */
export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { unit, can, supabase } = await opsContext();
  if (!can.maintenanceView) redirect("/ops");
  const items = await loadIncidents(supabase, unit.id);
  const open = items.filter((i) => isOpen(i.status));
  const closed = items.filter((i) => !isOpen(i.status));
  const alerts = incidentAlerts(items, today());
  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Incidencias</h1>
        {can.report && (
          <Link href="/ops/report" className="rounded-xl bg-[#d03b3b] px-3 py-2 text-sm font-bold text-white">
            + Reportar
          </Link>
        )}
      </div>
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-2xl p-3 text-sm font-semibold ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error || q.success}</p>
      )}
      {alerts.length > 0 && (
        <ul className="mb-4 space-y-2">
          {alerts.map((a) => (
            <li key={a.id}>
              <Link href={`/ops/incidents/${a.id}`} className={`block rounded-2xl p-3 text-sm font-semibold ${a.level === "critical" ? "bg-red-50 text-red-800" : "bg-orange-50 text-orange-900"}`}>
                ⚠ {a.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Abiertas · {open.length}</h2>
      <div className="mb-6 space-y-3">
        {open.length ? open.map((i) => <Row key={i.id} i={i} />) : <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-sm text-slate-500">Sin incidencias abiertas. ✓</p>}
      </div>
      {closed.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Cerradas (14 días)</h2>
          <div className="space-y-3 opacity-80">
            {closed.map((i) => (
              <Row key={i.id} i={i} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
