import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BlockChip, PriorityChip, StatusText } from "@/components/ops/incident-chips";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { PhotoPicker } from "@/components/ops/photo-picker";
import { loadIncident, loadUnitStaff, opsContext, signedPhotos } from "@/modules/lodging/application/ops-queries";
import { addIncidentPhotosAction, updateIncidentAction } from "@/modules/lodging/application/ops-actions";
import { failureCategories } from "@/modules/lodging/domain/audits";
import { incidentSources, isBlocking, isOpen, MAX_PHOTOS } from "@/modules/lodging/domain/incidents";
import { operationalStatusLabels, type OperationalStatus } from "@/modules/lodging/domain/operations";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

function Action({ id, action, children }: { id: string; action: string; children: React.ReactNode }) {
  return (
    <form action={updateIncidentAction} className="space-y-2">
      <input type="hidden" name="incident_id" value={id} />
      <input type="hidden" name="action" value={action} />
      {children}
    </form>
  );
}

export default async function IncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ incidentId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ incidentId }, q] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(incidentId).success) notFound();
  const { ctx, can, supabase } = await opsContext();
  const incident = await loadIncident(supabase, incidentId);
  if (!incident) notFound();
  const [photos, staff] = await Promise.all([
    signedPhotos(supabase, incident),
    can.maintenanceManage && isOpen(incident.status) ? loadUnitStaff(supabase, incident.business_unit_id) : Promise.resolve([]),
  ]);
  const open = isOpen(incident.status);
  const blocking = isBlocking(incident);
  const canAddPhotos = open && photos.length < MAX_PHOTOS && (incident.reported_by === ctx.user.id || can.maintenanceManage);

  const timeline: [string, string | null][] = [
    [`Reportada por ${incident.reported_by_name ?? "—"} (${incidentSources[incident.source]})`, incident.created_at],
    [`Habitación bloqueada`, incident.room_blocked_at],
    [`Asignada a ${incident.assigned_to_name ?? "—"}`, incident.assigned_at],
    [`En curso`, incident.started_at],
    [`Habitación liberada → pendiente de inspección`, incident.room_released_at],
    [`${incident.status === "cancelled" ? "Cancelada" : "Resuelta"} por ${incident.resolved_by_name ?? "—"}`, incident.resolved_at],
  ];

  return (
    <>
      <Link href={can.maintenanceView ? "/ops/incidents" : "/ops"} className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-2xl p-3 text-sm font-semibold ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error || q.success}</p>
      )}
      <div className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold">
            {incident.room_name ?? "Áreas comunes"} · {failureCategories[incident.category]}
          </h1>
          <PriorityChip priority={incident.priority} />
        </div>
        <p className="mt-2 whitespace-pre-line text-base">{incident.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusText status={incident.status} />
          {blocking && <BlockChip kind={incident.blocks_room!} />}
          {incident.room_operational_status && (
            <span className="text-xs text-slate-500">Habitación: {operationalStatusLabels[incident.room_operational_status as OperationalStatus] ?? incident.room_operational_status}</span>
          )}
        </div>
        {blocking && incident.upcoming_arrival && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
            ⚠ Llegada el {incident.upcoming_arrival.date.slice(8, 10)}/{incident.upcoming_arrival.date.slice(5, 7)} ({incident.upcoming_arrival.guests} huésped
            {incident.upcoming_arrival.guests === 1 ? "" : "es"}): resolver o reasignar la reserva.
          </p>
        )}
        {incident.resolution_notes && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Solución: {incident.resolution_notes}</p>}
        {incident.cancel_reason && <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Cancelada: {incident.cancel_reason}</p>}
      </div>

      {photos.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {photos.map((p) =>
            p.url ? (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} className="aspect-square w-full rounded-xl object-cover" />
              </a>
            ) : null,
          )}
        </div>
      )}
      {canAddPhotos && (
        <form action={addIncidentPhotosAction} className="mb-4 space-y-2">
          <input type="hidden" name="incident_id" value={incident.id} />
          <input type="hidden" name="unit_id" value={incident.business_unit_id} />
          <PhotoPicker max={MAX_PHOTOS - photos.length} />
          <OpsSubmit className="h-12 bg-slate-700 text-white">Subir fotos</OpsSubmit>
        </form>
      )}

      {can.maintenanceManage && (open || blocking) && (
        <section className="mb-4 space-y-4 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Gestión</h2>
          {open && (
            <>
              <Action id={incident.id} action="assign">
                <div className="flex gap-2">
                  <select name="assigned_to" required defaultValue={incident.assigned_to ?? ""} className="h-12 min-w-0 flex-1 rounded-xl border bg-white px-3 text-sm">
                    <option value="" disabled>
                      Asignar a…
                    </option>
                    {staff.map((s) => (
                      <option key={s.staff_id} value={s.staff_id}>
                        {s.staff_name}
                        {s.staff_role ? ` · ${s.staff_role}` : ""}
                      </option>
                    ))}
                  </select>
                  <button className="h-12 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white">Asignar</button>
                </div>
              </Action>
              {incident.status !== "in_progress" && (
                <Action id={incident.id} action="start">
                  <OpsSubmit className="h-12 bg-[#2a78d6] text-white">INICIAR REPARACIÓN</OpsSubmit>
                </Action>
              )}
              <Action id={incident.id} action="resolve">
                <textarea name="notes" required minLength={3} maxLength={1000} rows={2} placeholder="¿Qué se hizo?" className="w-full rounded-xl border p-3 text-sm" />
                <OpsSubmit className="bg-emerald-600 text-white">✓ MARCAR RESUELTA</OpsSubmit>
                {blocking && <p className="text-xs text-slate-500">La habitación quedará pendiente de inspección de recepción.</p>}
              </Action>
            </>
          )}
          {incident.room_id && (
            <div className="grid grid-cols-2 gap-2">
              {blocking ? (
                <Action id={incident.id} action="unblock">
                  <OpsSubmit className="h-12 bg-white text-sm text-slate-800 ring-1 ring-slate-300" confirmMessage="¿Liberar la habitación? Quedará pendiente de inspección.">
                    Liberar habitación
                  </OpsSubmit>
                </Action>
              ) : (
                open && (
                  <Action id={incident.id} action="block">
                    <input type="hidden" name="kind" value="maintenance" />
                    <OpsSubmit className="h-12 bg-white text-sm text-slate-800 ring-1 ring-slate-300">Bloquear (mantención)</OpsSubmit>
                  </Action>
                )
              )}
              {open && !(blocking && incident.blocks_room === "out_of_service") ? (
                <Action id={incident.id} action="block">
                  <input type="hidden" name="kind" value="out_of_service" />
                  <OpsSubmit className="h-12 bg-white text-sm text-red-700 ring-1 ring-red-300" confirmMessage="¿Dejar la habitación fuera de servicio?">
                    Fuera de servicio
                  </OpsSubmit>
                </Action>
              ) : null}
            </div>
          )}
          {open && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-600">Cancelar incidencia</summary>
              <Action id={incident.id} action="cancel">
                <input name="reason" required minLength={3} maxLength={300} placeholder="Motivo (duplicada, no era un problema…)" className="mt-2 h-12 w-full rounded-xl border px-3 text-sm" />
                <OpsSubmit className="h-12 bg-slate-200 text-slate-800">Cancelar incidencia</OpsSubmit>
              </Action>
            </details>
          )}
        </section>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Historial</h2>
        <ol className="space-y-2 text-sm">
          {timeline
            .filter(([, at]) => at)
            .sort((a, b) => new Date(a[1]!).getTime() - new Date(b[1]!).getTime())
            .map(([label, at]) => (
              <li key={label} className="flex justify-between gap-3">
                <span>{label}</span>
                <span className="shrink-0 text-slate-500">{fmt(at!)}</span>
              </li>
            ))}
        </ol>
        {incident.room_id && (can.operations || can.auditView) && (
          <Link href={`/ops/room/${incident.room_id}`} className="mt-3 inline-block text-sm font-semibold text-[#0b4f9c]">
            Ver historial de la habitación →
          </Link>
        )}
      </section>
    </>
  );
}
