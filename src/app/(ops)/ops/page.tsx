import Link from "next/link";
import { Elapsed } from "@/components/ops/elapsed";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { SupervisionPanel } from "@/components/ops/supervision-panel";
import { loadAuditMonth, loadAuditWeek, loadBoard, opsContext } from "@/modules/lodging/application/ops-queries";
import { santiagoIsoWeekday, supervisionAlerts } from "@/modules/lodging/domain/audits";
import { startCleaningAction } from "@/modules/lodging/application/ops-actions";
import {
  arrivalLabel,
  byUrgency,
  minutesToArrival,
  operationalStatusLabels,
  operationalStatusTone,
  statusCounts,
  type OpsBoard,
  type OpsRoom,
} from "@/modules/lodging/domain/operations";

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

function StatusChip({ room }: { room: OpsRoom }) {
  const tone = operationalStatusTone[room.operational_status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tone.chip}`}>
      <span aria-hidden>{tone.icon}</span>
      {room.rework && room.operational_status === "dirty" ? "Retrabajo" : operationalStatusLabels[room.operational_status]}
    </span>
  );
}

function ArrivalLine({ room, board, now }: { room: OpsRoom; board: OpsBoard; now: Date }) {
  const minutes = minutesToArrival(room, now, board.today);
  const urgent = minutes !== null && minutes <= board.settings.dirty_alert_minutes;
  return (
    <p className={`mt-1 text-sm ${urgent ? "font-bold text-red-700" : "text-slate-600"}`}>
      {urgent && "⚠ "}Próximo check-in: {arrivalLabel(room, board.today)}
      {urgent && minutes !== null && minutes > 0 && ` (en ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`})`}
    </p>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        {title}
        {count !== undefined && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{count}</span>}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-sm text-slate-500">{children}</p>
);

export default async function OpsHome({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, can, supabase } = await opsContext();
  const board = await loadBoard(supabase, unit.id);
  const now = new Date();
  // Supervisión: auditorías de todos los hostales asignados y alertas calculadas al abrir.
  const supervision = can.auditView ? await (async () => {
    const week = await loadAuditWeek(supabase);
    const month = board.today.slice(0, 7);
    const kpis = Object.fromEntries(
      await Promise.all(week.units.map(async (u) => [u.id, await loadAuditMonth(supabase, u.id, month).catch(() => undefined)] as const)),
    );
    return { week, alerts: supervisionAlerts(week, kpis, santiagoIsoWeekday(now)) };
  })() : null;
  const urgency = byUrgency(now, board.today);
  const rooms = board.rooms;
  const mine = rooms.filter((r) => r.task?.status === "in_progress" && r.task.started_by === ctx.user.id);
  const dirty = rooms.filter((r) => r.operational_status === "dirty").sort(urgency);
  const cleaningOthers = rooms.filter((r) => r.operational_status === "cleaning" && !mine.includes(r));
  const toInspect = rooms.filter((r) => r.operational_status === "pending_inspection").sort(urgency);
  const counts = statusCounts(rooms);

  return (
    <>
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-2xl p-3 text-sm font-semibold ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}

      {supervision && <SupervisionPanel week={supervision.week} alerts={supervision.alerts} canAudit={can.audit} />}

      {(can.inspect || can.operations) && (
        <div className="mb-6 grid grid-cols-3 gap-2 text-center">
          {[
            ["Llegadas", board.arrivals_today],
            ["Salidas", board.departures_today],
            ["Listas", counts.inspected],
            ["Por limpiar", counts.dirty],
            ["En limpieza", counts.cleaning],
            ["Por inspeccionar", counts.pending_inspection],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {can.clean && (
        <>
          {mine.length > 0 && (
            <Section title="Estoy limpiando">
              {mine.map((r) => (
                <article key={r.id} className="rounded-3xl border-2 border-amber-300 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xl font-bold">{r.name}</h3>
                    <StatusChip room={r} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Tiempo transcurrido: <b>{r.task?.started_at ? <Elapsed since={r.task.started_at} /> : "—"}</b>
                  </p>
                  <ArrivalLine room={r} board={board} now={now} />
                  <Link href={`/ops/clean/${r.task!.id}`} className="mt-3 flex h-14 items-center justify-center rounded-2xl bg-amber-500 text-base font-bold text-white">
                    FINALIZAR LIMPIEZA
                  </Link>
                </article>
              ))}
            </Section>
          )}
          <Section title="Habitaciones por limpiar" count={dirty.length}>
            {dirty.length ? (
              dirty.map((r) => (
                <article key={r.id} className="rounded-3xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xl font-bold">{r.name}</h3>
                    <StatusChip room={r} />
                  </div>
                  <ArrivalLine room={r} board={board} now={now} />
                  {r.rework && r.last_rejection && <p className="mt-1 text-sm font-semibold text-red-700">Rechazada: {r.last_rejection.reason}</p>}
                  {r.occupied && <p className="mt-1 text-sm text-amber-700">Huésped aún registrado en la habitación</p>}
                  <form action={startCleaningAction} className="mt-3">
                    <input type="hidden" name="room_id" value={r.id} />
                    <OpsSubmit className="bg-[#d03b3b] text-white">COMENZAR</OpsSubmit>
                  </form>
                </article>
              ))
            ) : (
              <Empty>No hay habitaciones pendientes de limpieza. ✓</Empty>
            )}
          </Section>
          {cleaningOthers.length > 0 && (
            <Section title="En limpieza por otras personas">
              {cleaningOthers.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
                  <b>{r.name}</b>
                  <span className="text-slate-600">
                    {r.task?.started_by_name ?? "—"} · {r.task?.started_at ? <Elapsed since={r.task.started_at} /> : ""}
                  </span>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {can.inspect && (
        <Section title="Pendientes de inspección" count={toInspect.length}>
          {toInspect.length ? (
            toInspect.map((r) => (
              <article key={r.id} className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-bold">{r.name}</h3>
                  <StatusChip room={r} />
                </div>
                {r.awaiting ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Limpieza terminada {hhmm(r.awaiting.completed_at)}
                    {r.awaiting.completed_by_name ? ` · ${r.awaiting.completed_by_name}` : ""}
                    {r.awaiting.duration_minutes !== null ? ` · ${r.awaiting.duration_minutes} min` : ""}
                    {r.awaiting.attempt > 1 ? ` · intento ${r.awaiting.attempt}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">Vuelve de mantención</p>
                )}
                <ArrivalLine room={r} board={board} now={now} />
                <Link href={`/ops/inspect/${r.id}`} className="mt-3 flex h-14 items-center justify-center rounded-2xl bg-[#2a78d6] text-base font-bold text-white">
                  INSPECCIONAR
                </Link>
              </article>
            ))
          ) : (
            <Empty>No hay habitaciones esperando inspección.</Empty>
          )}
        </Section>
      )}

      {can.operations && (
        <Section title="Todas las habitaciones" count={rooms.length}>
          <div className="divide-y rounded-2xl bg-white shadow-sm">
            {[...rooms]
              .sort((a, b) => a.display_order - b.display_order)
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {can.auditView || can.operations ? (
                        <Link href={`/ops/room/${r.id}`} className="underline decoration-slate-300 underline-offset-2">
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {r.occupied ? "Ocupada · " : ""}
                      {arrivalLabel(r, board.today)}
                    </p>
                  </div>
                  <StatusChip room={r} />
                </div>
              ))}
          </div>
        </Section>
      )}
    </>
  );
}
