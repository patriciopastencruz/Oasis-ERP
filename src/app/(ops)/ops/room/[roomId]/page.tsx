import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { loadRoomHistory, opsContext } from "@/modules/lodging/application/ops-queries";
import { auditActionLabels, failureCategories, responsibilityLabels, type AuditAction, type FailureCategory, type Responsibility } from "@/modules/lodging/domain/audits";
import { operationalStatusLabels, type OperationalStatus } from "@/modules/lodging/domain/operations";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
/** Semana ISO en Santiago ("Semana 38"). */
function isoWeek(iso: string) {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));
  const d = new Date(`${local}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `Semana ${Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)}`;
}

/** Histórico de la habitación: limpiezas, inspecciones, auditorías e incidencias. */
export default async function RoomHistoryPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!z.string().uuid().safeParse(roomId).success) notFound();
  const { can, supabase } = await opsContext();
  if (!can.auditView && !can.operations) redirect("/ops");
  const history = await loadRoomHistory(supabase, roomId);
  if (!history) notFound();
  const groups = new Map<string, typeof history.items>();
  for (const it of history.items) {
    const key = isoWeek(it.at);
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <div className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">{history.room.name}</h1>
        <p className="text-sm text-slate-600">
          {history.room.room_type} · {operationalStatusLabels[history.room.operational_status as OperationalStatus] ?? history.room.operational_status}
        </p>
      </div>
      {!history.items.length && <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-500">Sin registros todavía.</p>}
      {[...groups.entries()].map(([week, items]) => (
        <section key={week} className="mb-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{week}</h2>
          <ol className="space-y-2">
            {items.map((it, i) => {
              const d = it.data;
              let title = "";
              let detail = "";
              let tone = "border-slate-200";
              if (it.kind === "cleaning") {
                title = `Limpieza: ${d.by ?? "—"}`;
                detail = `${d.minutes ?? "—"} min${Number(d.attempt) > 1 ? ` · intento ${d.attempt}` : ""}${d.origin === "audit" ? " · por auditoría" : ""}`;
              } else if (it.kind === "inspection") {
                title = `Inspección: ${d.by ?? "—"}`;
                detail = d.result === "approved" ? "Aprobada" : `Rechazada · ${d.reason ?? ""}`;
                tone = d.result === "approved" ? "border-emerald-200" : "border-red-300";
              } else if (it.kind === "audit") {
                title = `Auditoría supervisor: ${d.by ?? "—"}`;
                detail =
                  d.result === "passed"
                    ? "Aprobada"
                    : `Fallida · ${failureCategories[d.category as FailureCategory] ?? d.category ?? ""}${d.responsibility ? ` · ${responsibilityLabels[d.responsibility as Responsibility]}` : ""}${d.action ? ` · Acción: ${auditActionLabels[d.action as AuditAction]}` : ""}`;
                tone = d.result === "passed" ? "border-emerald-300" : "border-red-400";
              } else {
                title = `Incidencia: ${failureCategories[d.category as FailureCategory] ?? d.category}`;
                detail = `${d.priority} · ${d.status} · ${d.description ?? ""}`;
                tone = "border-orange-300";
              }
              return (
                <li key={i} className={`rounded-2xl border-l-4 bg-white px-4 py-3 shadow-sm ${tone}`}>
                  <p className="text-xs text-slate-500">{fmt(it.at)}</p>
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-sm text-slate-600">{detail}</p>
                  {it.kind === "audit" && d.notes && <p className="text-xs text-slate-500">“{d.notes}”</p>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </>
  );
}
