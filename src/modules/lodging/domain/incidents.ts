import { failureCategories, type FailureCategory } from "./audits";

/** Categorías de incidencia (las mismas de las auditorías) con icono para botones grandes. */
export const incidentCategories: [FailureCategory, string, string][] = (
  [
    ["agua_caliente", "🔥"],
    ["bano", "🚿"],
    ["plomeria", "💧"],
    ["electricidad", "⚡"],
    ["tv", "📺"],
    ["wifi", "📶"],
    ["cerradura", "🔑"],
    ["mobiliario", "🪑"],
    ["ventana", "🪟"],
    ["ropa_cama", "🛏"],
    ["limpieza", "🧽"],
    ["otro", "•"],
  ] as const
).map(([key, icon]) => [key, failureCategories[key], icon]);

export const incidentPriorities = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
} as const;
export type IncidentPriority = keyof typeof incidentPriorities;

/** Tonos de estado reservados (bien/atención/grave/crítico) con texto, nunca solo color. */
export const priorityTone: Record<IncidentPriority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-900",
  high: "bg-orange-100 text-orange-900",
  critical: "bg-red-100 text-red-800",
};

export const incidentStatuses = {
  open: "Abierta",
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
  cancelled: "Cancelada",
} as const;
export type IncidentStatus = keyof typeof incidentStatuses;
export const openStatuses: IncidentStatus[] = ["open", "assigned", "in_progress"];
export const isOpen = (s: IncidentStatus) => openStatuses.includes(s);

export const incidentSources = {
  housekeeping: "Aseo",
  reception: "Recepción",
  audit: "Auditoría",
  facility_audit: "Auditoría general",
  manual: "Administración",
} as const;

export const blockLabels = {
  maintenance: "En mantención",
  out_of_service: "Fuera de servicio",
} as const;
export type BlockKind = keyof typeof blockLabels;

export type IncidentItem = {
  id: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  category: FailureCategory;
  description: string;
  source: keyof typeof incidentSources;
  created_at: string;
  room_id: string | null;
  room_name: string | null;
  blocks_room: BlockKind | null;
  room_blocked_at: string | null;
  room_released_at: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  photos: number;
  upcoming_arrival: { date: string; guests: number } | null;
};

export type IncidentDetail = Omit<IncidentItem, "reported_by" | "assigned_to" | "photos"> & {
  business_unit_id: string;
  company_id: string;
  reported_by: string;
  assigned_to: string | null;
  reported_by_name: string | null;
  assigned_to_name: string | null;
  resolved_by_name: string | null;
  room_operational_status: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  cancel_reason: string | null;
  assigned_at: string | null;
  started_at: string | null;
  attachments: { id: string; path: string; name: string }[];
};

/** La habitación sigue bloqueada por esta incidencia. */
export const isBlocking = (i: Pick<IncidentItem, "blocks_room" | "room_released_at">) => !!i.blocks_room && !i.room_released_at;

export type IncidentAlert = { id: string; level: "critical" | "serious"; text: string };

/**
 * "Requiere atención" de mantención: habitación bloqueada con llegada en los
 * próximos días e incidencias críticas sin atender. Una alerta por incidencia.
 */
export function incidentAlerts(items: IncidentItem[], today: string): IncidentAlert[] {
  const alerts: IncidentAlert[] = [];
  for (const i of items) {
    if (!isOpen(i.status)) continue;
    if (isBlocking(i) && i.upcoming_arrival) {
      const when = i.upcoming_arrival.date === today ? "hoy" : `el ${i.upcoming_arrival.date.slice(8, 10)}/${i.upcoming_arrival.date.slice(5, 7)}`;
      alerts.push({ id: i.id, level: "critical", text: `${i.room_name} está ${blockLabels[i.blocks_room!].toLowerCase()} y tiene llegada ${when}` });
    } else if (i.priority === "critical" && i.status === "open") {
      alerts.push({ id: i.id, level: "serious", text: `Incidencia crítica sin asignar${i.room_name ? ` en ${i.room_name}` : ""}: ${failureCategories[i.category]}` });
    }
  }
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "critical" ? -1 : 1));
}

/** Tamaño máximo de la foto ya reducida en el teléfono y fotos por incidencia. */
export const MAX_PHOTO_BYTES = 10_485_760;
export const MAX_PHOTOS = 5;
