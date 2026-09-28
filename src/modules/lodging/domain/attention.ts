import type { SupervisionAlert } from "./audits";
import { minutesToArrival, operationalStatusLabels, statusCounts, type OpsBoard, type OpsRoom } from "./operations";

/** Criticidad con estados reservados: crítico, grave, atención, informativo. */
export type AttentionLevel = "critical" | "serious" | "warning" | "info";
const levelRank: Record<AttentionLevel, number> = { critical: 0, serious: 1, warning: 2, info: 3 };

export type AttentionKind =
  | "checkin_blocked"
  | "dirty_arrival"
  | "cleaning_arrival"
  | "inspection_arrival"
  | "blocked_arrival"
  | "critical_incident"
  | "rejected"
  | "inspection_waiting"
  | "unassigned"
  | "audit";

export type AttentionItem = {
  unitId: string;
  unitName: string;
  roomId: string | null;
  kind: AttentionKind;
  level: AttentionLevel;
  text: string;
  /** Minutos al próximo check-in (negativo si ya pasó); ordena a igual criticidad. */
  minutes: number | null;
  /** Ruta de /ops donde se resuelve, dentro del hostal del ítem. */
  href: string | null;
};

export const shortUnitName = (name: string) => name.replace(/^Hostal\s+(Oasis\s+)?/i, "");

/** "45 min", "1 h 30 min", "3 h". */
export function durationLabel(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const minutesSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 60_000 : null);

function daysLabel(date: string, today: string) {
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return days === 0 ? "hoy" : days === 1 ? "mañana" : `el ${date.slice(8)}-${date.slice(5, 7)}`;
}

/**
 * Excepciones de la operación diaria de un hostal, calculadas al abrir el
 * portal a partir del tablero (sin datos financieros ni del huésped). Cada
 * habitación genera como máximo una alerta operacional —la más grave— y, aparte,
 * una por incidencia crítica.
 */
export function roomAttention(board: OpsBoard, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const unit = { unitId: board.unit.id, unitName: shortUnitName(board.unit.name) };
  const { dirty_alert_minutes: dirtyAlert, inspection_alert_minutes: inspectionAlert } = board.settings;
  for (const r of board.rooms) {
    const add = (kind: AttentionKind, level: AttentionLevel, text: string, minutes: number | null, href: string | null) =>
      items.push({ ...unit, roomId: r.id, kind, level, text, minutes, href });
    const arrivalToday = r.next_arrival?.date === board.today;
    const m = minutesToArrival(r, now, board.today);
    const history = `/ops/room/${r.id}`;
    const s = r.operational_status;

    if ((s === "maintenance" || s === "out_of_service") && r.next_arrival && m !== null && m <= 3 * 1440) {
      add("blocked_arrival", arrivalToday ? "critical" : "serious", `${r.name} está ${s === "maintenance" ? "en mantención" : "fuera de servicio"} y tiene llegada ${daysLabel(r.next_arrival.date, board.today)}`, m, "/ops/incidents");
    } else if (arrivalToday && m !== null && m <= 0 && (s === "dirty" || s === "cleaning" || s === "pending_inspection")) {
      add("checkin_blocked", "critical", `Check-in bloqueado: ${r.name} no está inspeccionada (llegada ${r.next_arrival!.time}, ${operationalStatusLabels[s].toLowerCase()})`, m, s === "pending_inspection" ? `/ops/inspect/${r.id}` : history);
    } else if (arrivalToday && m !== null && s === "dirty" && m <= dirtyAlert) {
      add("dirty_arrival", m <= 60 ? "critical" : "serious", `${r.name} sigue sucia y tiene check-in en ${durationLabel(m)}`, m, history);
    } else if (arrivalToday && m !== null && s === "cleaning" && m <= inspectionAlert) {
      add("cleaning_arrival", "serious", `${r.name} sigue en limpieza y tiene check-in en ${durationLabel(m)}`, m, history);
    } else if (arrivalToday && m !== null && s === "pending_inspection" && m <= dirtyAlert) {
      add("inspection_arrival", "serious", `${r.name} espera inspección y tiene check-in en ${durationLabel(m)}`, m, `/ops/inspect/${r.id}`);
    } else if (s === "dirty" && r.rework && r.last_rejection) {
      add("rejected", "warning", `Inspección rechazada: ${r.name} (${r.last_rejection.reason})`, m, history);
    } else if (s === "pending_inspection") {
      const waiting = minutesSince(r.awaiting?.completed_at ?? r.status_changed_at, now);
      if (waiting !== null && waiting > inspectionAlert) add("inspection_waiting", "warning", `${r.name} espera inspección hace ${durationLabel(waiting)}`, m, `/ops/inspect/${r.id}`);
    } else if (s === "dirty" && r.task?.status !== "in_progress" && !r.occupied) {
      const idle = minutesSince(r.status_changed_at, now);
      if (idle !== null && idle > dirtyAlert) add("unassigned", "warning", `${r.name} está sucia hace ${durationLabel(idle)} y nadie la ha tomado`, m, history);
    }

    if (r.incidents?.top_priority === "critical") add("critical_incident", "critical", `Incidencia crítica en ${r.name}`, m, "/ops/incidents");
  }
  return items;
}

/** Alertas de auditoría (fase G) en el mismo listado. */
export function auditAttention(alerts: SupervisionAlert[], unitIdByShortName: Record<string, string>): AttentionItem[] {
  return alerts.map((a) => ({
    unitId: unitIdByShortName[a.unit] ?? "",
    unitName: a.unit,
    roomId: null,
    kind: "audit",
    level: a.level,
    text: a.text,
    minutes: null,
    href: "/ops/audits",
  }));
}

/** Orden: criticidad y luego tiempo restante antes del check-in. */
export function sortAttention(items: AttentionItem[]) {
  return [...items].sort(
    (a, b) => levelRank[a.level] - levelRank[b.level] || (a.minutes ?? Number.POSITIVE_INFINITY) - (b.minutes ?? Number.POSITIVE_INFINITY) || a.unitName.localeCompare(b.unitName, "es"),
  );
}

export type UnitOverview = {
  id: string;
  name: string;
  total: number;
  occupied: number;
  available: number;
  counts: ReturnType<typeof statusCounts>;
  arrivals: number;
  departures: number;
  incidents: number;
  late: number;
  /** Otras excepciones (rechazos, esperas, sin responsable). */
  pending: number;
  critical: number;
};

const lateKinds: AttentionKind[] = ["checkin_blocked", "dirty_arrival", "cleaning_arrival", "inspection_arrival", "blocked_arrival"];

/** Resumen por hostal para "Mis hostales" y la vista consolidada. */
export function unitOverview(board: OpsBoard, items: AttentionItem[]): UnitOverview {
  const own = items.filter((i) => i.unitId === board.unit.id && i.kind !== "audit");
  const occupied = board.rooms.filter((r: OpsRoom) => r.occupied).length;
  return {
    id: board.unit.id,
    name: shortUnitName(board.unit.name),
    total: board.rooms.length,
    occupied,
    available: board.rooms.filter((r) => r.operational_status === "inspected" && !r.occupied).length,
    counts: statusCounts(board.rooms),
    arrivals: board.arrivals_today,
    departures: board.departures_today,
    incidents: board.incidents_open ?? 0,
    late: own.filter((i) => lateKinds.includes(i.kind)).length,
    pending: own.filter((i) => !lateKinds.includes(i.kind) && i.kind !== "critical_incident").length,
    critical: own.filter((i) => i.level === "critical").length,
  };
}

/** Línea de estado: "Operación normal" o lo que requiere atención. */
export function healthLine(u: UnitOverview) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (u.late) parts.push(plural(u.late, "habitación atrasada", "habitaciones atrasadas"));
  if (u.incidents) parts.push(plural(u.incidents, "incidencia", "incidencias"));
  if (u.pending) parts.push(plural(u.pending, "pendiente", "pendientes"));
  return parts.length ? { ok: false, text: parts.join(" · ") } : { ok: true, text: "Operación normal" };
}
