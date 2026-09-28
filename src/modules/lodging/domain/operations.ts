export type OperationalStatus = "dirty" | "cleaning" | "pending_inspection" | "inspected" | "maintenance" | "out_of_service";

export const operationalStatusLabels: Record<OperationalStatus, string> = {
  dirty: "Pendiente de aseo",
  cleaning: "En limpieza",
  pending_inspection: "Por inspeccionar",
  inspected: "Lista",
  maintenance: "Mantención",
  out_of_service: "Fuera de servicio",
};

/** Colores de estado (con ícono/etiqueta siempre al lado, nunca solo color). */
export const operationalStatusTone: Record<OperationalStatus, { dot: string; chip: string; icon: string }> = {
  dirty: { dot: "bg-[#d03b3b]", chip: "bg-red-50 text-red-800", icon: "●" },
  cleaning: { dot: "bg-[#fab219]", chip: "bg-amber-50 text-amber-900", icon: "◐" },
  pending_inspection: { dot: "bg-[#2a78d6]", chip: "bg-blue-50 text-blue-900", icon: "◔" },
  inspected: { dot: "bg-[#0ca30c]", chip: "bg-emerald-50 text-emerald-800", icon: "✓" },
  maintenance: { dot: "bg-[#ec835a]", chip: "bg-orange-50 text-orange-900", icon: "⚠" },
  out_of_service: { dot: "bg-slate-500", chip: "bg-slate-100 text-slate-700", icon: "✕" },
};

/** Checklist de aseo: todo marcado por defecto, se desmarca solo lo que tiene problema. */
export const housekeepingChecklist = [
  ["cama", "Cama"],
  ["sabanas", "Sábanas"],
  ["almohadas", "Almohadas"],
  ["toallas", "Toallas"],
  ["bano", "Baño"],
  ["wc", "WC"],
  ["ducha", "Ducha"],
  ["papel", "Papel higiénico"],
  ["basureros", "Basureros"],
  ["piso", "Piso"],
  ["escritorio", "Escritorio"],
  ["tv", "TV"],
  ["luces", "Luces"],
  ["enchufes", "Enchufes"],
  ["ventanas", "Ventanas"],
  ["cerradura", "Cerradura"],
  ["agua_caliente", "Agua caliente"],
  ["objetos_olvidados", "Sin objetos olvidados"],
  ["olores", "Sin malos olores"],
  ["presentacion", "Presentación general"],
] as const;

export const inspectionChecklist = [
  ["presentacion", "Presentación general"],
  ["cama", "Cama"],
  ["bano", "Baño"],
  ["toallas", "Toallas y amenities"],
  ["agua_caliente", "Agua caliente"],
  ["equipamiento", "Equipamiento"],
  ["desperfectos", "Sin desperfectos visibles"],
] as const;

export const rejectionReasons = [
  "Baño mal limpiado",
  "Falta toalla",
  "Sábanas manchadas",
  "Piso pendiente",
  "Habitación con olor",
  "Problema en la ducha",
  "Equipamiento defectuoso",
  "Otro",
] as const;

/** Arma el checklist {clave: ok} a partir de un formulario (todo ok si allOk). */
export function checklistFrom(items: readonly (readonly [string, string])[], checked: Set<string>, allOk: boolean) {
  return Object.fromEntries(items.map(([key]) => [key, allOk || checked.has(key)]));
}

export type OpsRoom = {
  id: string;
  name: string;
  room_type: string;
  display_order: number;
  operational_status: OperationalStatus;
  rework: boolean;
  status_changed_at: string;
  occupied: boolean;
  departure_today: boolean;
  task: { id: string; status: "pending" | "in_progress"; origin: string; attempt: number; started_at: string | null; started_by: string | null; started_by_name: string | null } | null;
  awaiting: { task_id: string; completed_at: string; completed_by_name: string | null; duration_minutes: number | null; attempt: number } | null;
  last_rejection: { reason: string; at: string } | null;
  next_arrival: { date: string; time: string; guests: number } | null;
  /** Incidencias abiertas de la habitación (opcional en tableros antiguos). */
  incidents?: { open: number; blocking: boolean; top_priority: "low" | "medium" | "high" | "critical" | null };
};
export type OpsBoard = {
  unit: { id: string; code: string; name: string };
  today: string;
  settings: { checkin: string; checkout: string; inspection_alert_minutes: number; dirty_alert_minutes: number };
  arrivals_today: number;
  departures_today: number;
  incidents_open?: number;
  rooms: OpsRoom[];
};

/** Minutos que faltan para el próximo check-in de la habitación (null si no hay). */
export function minutesToArrival(room: Pick<OpsRoom, "next_arrival">, now: Date, today: string) {
  if (!room.next_arrival) return null;
  const nowLocal = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const [nh, nm] = nowLocal.split(":").map(Number);
  const [ah, am] = room.next_arrival.time.split(":").map(Number);
  const dayDiff = Math.round((Date.parse(`${room.next_arrival.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return dayDiff * 1440 + (ah * 60 + am) - (nh * 60 + nm);
}

/** Orden de trabajo: primero lo que tiene check-in más próximo; retrabajos antes a igual hora. */
export function byUrgency(now: Date, today: string) {
  return (a: OpsRoom, b: OpsRoom) => {
    const ma = minutesToArrival(a, now, today) ?? Number.POSITIVE_INFINITY;
    const mb = minutesToArrival(b, now, today) ?? Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma - mb;
    if (a.rework !== b.rework) return a.rework ? -1 : 1;
    return a.display_order - b.display_order;
  };
}

/** Texto corto del próximo check-in: "Hoy 14:00", "Mañana 15:30", "vie 02-10 14:00". */
export function arrivalLabel(room: Pick<OpsRoom, "next_arrival">, today: string) {
  if (!room.next_arrival) return "Sin llegadas próximas";
  const d = room.next_arrival.date;
  const days = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const day = days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8)}-${d.slice(5, 7)}`;
  return `${day} ${room.next_arrival.time}`;
}

export function statusCounts(rooms: OpsRoom[]) {
  const counts = { dirty: 0, cleaning: 0, pending_inspection: 0, inspected: 0, maintenance: 0, out_of_service: 0 } as Record<OperationalStatus, number>;
  for (const r of rooms) counts[r.operational_status] += 1;
  return counts;
}
