import type { OperationalStatus, OpsRoom } from "./operations";

export type OpsKpis = {
  unit: { id: string; code: string; name: string };
  from: string;
  to: string;
  totals: {
    cleanings: number;
    avg_minutes: number | null;
    max_minutes: number | null;
    rework: number;
    inspected: number;
    approved_first: number;
    first_attempt: number;
    avg_wait_minutes: number | null;
  };
  inspections: { total: number; approved: number; rejected: number };
  rejection_reasons: { reason: string; n: number }[];
  by_room: { id: string; name: string; cleanings: number; avg_minutes: number | null; max_minutes: number | null; rework: number; rejected: number; last_cleaned_at: string | null; last_minutes: number | null }[];
  by_person: { id: string; name: string; cleanings: number; avg_minutes: number | null; rejected: number; inspected: number }[];
  by_inspector: { id: string; name: string; inspections: number; rejected: number }[];
};

export type Period = "today" | "week" | "month";
export const periodLabels: Record<Period, string> = { today: "Hoy", week: "Últimos 7 días", month: "Este mes" };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Rango de fechas (inclusive) del período, en fechas de Santiago. */
export function periodRange(period: Period, today: string) {
  if (period === "week") return { from: addDays(today, -6), to: today };
  if (period === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: today, to: today };
}

const weighted = (items: { value: number | null; weight: number }[]) => {
  const valid = items.filter((i) => i.value !== null && i.weight > 0);
  const weight = valid.reduce((s, i) => s + i.weight, 0);
  return weight ? Math.round(valid.reduce((s, i) => s + (i.value as number) * i.weight, 0) / weight) : null;
};

/** Totales de varios hostales: promedios ponderados por cantidad de limpiezas / inspecciones. */
export function combineTotals(list: OpsKpis[]) {
  const sum = (f: (k: OpsKpis) => number) => list.reduce((s, k) => s + f(k), 0);
  const cleanings = sum((k) => k.totals.cleanings);
  const firstAttempt = sum((k) => k.totals.first_attempt);
  const inspected = sum((k) => k.totals.inspected);
  return {
    cleanings,
    avgMinutes: weighted(list.map((k) => ({ value: k.totals.avg_minutes, weight: k.totals.cleanings }))),
    maxMinutes: list.reduce<number | null>((m, k) => (k.totals.max_minutes === null ? m : Math.max(m ?? 0, k.totals.max_minutes)), null),
    rework: sum((k) => k.totals.rework),
    /** % de primeras limpiezas aprobadas por recepción a la primera. */
    approvedFirstPct: firstAttempt ? Math.round((sum((k) => k.totals.approved_first) / firstAttempt) * 100) : null,
    avgWaitMinutes: weighted(list.map((k) => ({ value: k.totals.avg_wait_minutes, weight: k.totals.inspected }))),
    inspected,
    rejected: sum((k) => k.inspections.rejected),
  };
}

/** Orden de la tabla de habitaciones: primero lo que requiere acción. */
const statusPriority: Record<OperationalStatus, number> = {
  out_of_service: 0,
  maintenance: 1,
  dirty: 2,
  cleaning: 3,
  pending_inspection: 4,
  inspected: 5,
};
export function roomPriority(a: Pick<OpsRoom, "operational_status" | "display_order" | "incidents">, b: Pick<OpsRoom, "operational_status" | "display_order" | "incidents">) {
  const pa = statusPriority[a.operational_status] - (a.incidents?.open ? 0.5 : 0);
  const pb = statusPriority[b.operational_status] - (b.incidents?.open ? 0.5 : 0);
  return pa - pb || a.display_order - b.display_order;
}

/** "45 min", "2 h 10 min", "3 d". */
export function sinceLabel(iso: string | null | undefined, now: Date) {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  return `${Math.floor(minutes / 1440)} d`;
}

export const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null);
