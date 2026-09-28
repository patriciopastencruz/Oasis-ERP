export const auditChecklist = [
  ["presentacion", "Presentación general"],
  ["limpieza", "Limpieza general"],
  ["cama", "Cama y ropa de cama"],
  ["bano", "Baño"],
  ["toallas", "Toallas / amenities"],
  ["agua_caliente", "Agua caliente"],
  ["equipamiento", "Equipamiento"],
  ["iluminacion", "Iluminación"],
  ["olores", "Olores"],
  ["desperfectos", "Sin desperfectos visibles"],
] as const;
export type AuditMark = "ok" | "observation" | "fail";
export const auditMarkLabels: Record<AuditMark, string> = { ok: "OK", observation: "Obs.", fail: "Falla" };

export const failureCategories = {
  bano: "Baño",
  agua_caliente: "Agua caliente",
  electricidad: "Electricidad",
  tv: "TV",
  wifi: "WiFi",
  cerradura: "Cerradura",
  mobiliario: "Mobiliario",
  ventana: "Ventana",
  limpieza: "Limpieza",
  ropa_cama: "Ropa de cama",
  plomeria: "Plomería",
  otro: "Otro",
} as const;
export type FailureCategory = keyof typeof failureCategories;

/** Origen de la falla: se distingue para no atribuir todo a una persona. */
export const responsibilityLabels = {
  housekeeping: "Limpieza (aseo)",
  reception: "Inspección de recepción",
  technical: "Problema técnico",
  new_issue: "Problema nuevo, posterior a la inspección",
} as const;
export type Responsibility = keyof typeof responsibilityLabels;

export const severityLabels = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" } as const;
export type Severity = keyof typeof severityLabels;

export const auditActionLabels = {
  reclean: "Nueva limpieza",
  incident: "Crear incidencia de mantención",
  admin_note: "Observación administrativa",
  none: "Sin acción adicional",
} as const;
export type AuditAction = keyof typeof auditActionLabels;

export const skipReasons = ["Huésped en la habitación", "Habitación en limpieza o en uso", "Sin acceso a la habitación", "Otro"] as const;

/** Arma el checklist de auditoría desde el formulario; lo no marcado cuenta como OK. */
export function auditChecklistFrom(read: (key: string) => string | null) {
  return Object.fromEntries(
    auditChecklist.map(([key]) => {
      const v = read(`mark_${key}`);
      return [key, v === "fail" || v === "observation" ? v : "ok"];
    }),
  ) as Record<string, AuditMark>;
}

export type AuditUnitWeek = {
  id: string;
  code: string;
  name: string;
  cleaned: number;
  target: number;
  passed: number;
  failed: number;
  done: number;
  skipped: number;
  pending: number;
  compliance: number;
  conformity: number | null;
  findings: number;
  incidents: number;
  ok_pct: number;
  warning_pct: number;
  open_audit: string | null;
};
export type AuditWeekSummary = { week_start: string; week_end: string; units: AuditUnitWeek[] };

export type ComplianceLight = "ok" | "warning" | "pending";
/** Semáforo de cumplimiento: ≥ ok_pct OK, ≥ warning_pct atención, bajo eso pendiente relevante. */
export function complianceLight(compliance: number, okPct = 100, warningPct = 80): ComplianceLight {
  if (compliance >= okPct) return "ok";
  if (compliance >= warningPct) return "warning";
  return "pending";
}
export const complianceLabels: Record<ComplianceLight, string> = { ok: "OK", warning: "Atención", pending: "Pendiente relevante" };

/** Totales de todos los hostales visibles. */
export function weekTotals(units: AuditUnitWeek[]) {
  const target = units.reduce((s, u) => s + u.target, 0);
  const done = units.reduce((s, u) => s + u.done, 0);
  const passed = units.reduce((s, u) => s + u.passed, 0);
  return {
    target,
    done,
    passed,
    failed: units.reduce((s, u) => s + u.failed, 0),
    pending: units.reduce((s, u) => s + u.pending, 0),
    compliance: target ? Math.round((1000 * done) / target) / 10 : 100,
    conformity: done ? Math.round((1000 * passed) / done) / 10 : null,
  };
}

export type MonthKpis = {
  month: string;
  audits: number;
  passed: number;
  failed: number;
  passed_pct: number | null;
  failed_pct: number | null;
  reception_discrepancy: number;
  by_responsibility: Partial<Record<Responsibility, number>>;
  categories: { category: FailureCategory; count: number; previous: number }[];
  rooms: { room_id: string; room: string; failed: number }[];
  recurrent: { room_id: string; room: string; failed: number }[];
  reworks: number;
  inspections_rejected: number;
  inspections_total: number;
  recent: { id: string; room_id: string; room: string; status: "passed" | "failed"; at: string; category: FailureCategory | null; responsibility: Responsibility | null; action: AuditAction | null }[];
};

export type SupervisionAlert = { level: "critical" | "warning" | "info"; unit: string; text: string };

/**
 * Alertas de supervisión calculadas al abrir el portal (una por situación y
 * hostal, sin repetir): cierre de semana con pendientes, hostal sin auditar,
 * auditorías fallidas, habitaciones reincidentes, fallas acumuladas en un
 * mismo proceso y categorías que aumentan.
 */
export function supervisionAlerts(week: AuditWeekSummary, monthByUnit: Record<string, MonthKpis | undefined>, isoWeekday: number) {
  const alerts: SupervisionAlert[] = [];
  const short = (name: string) => name.replace(/^Hostal\s+(Oasis\s+)?/i, "");
  for (const u of week.units) {
    const unit = short(u.name);
    if (u.target > 0 && u.done === 0 && isoWeekday >= 3)
      alerts.push({ level: isoWeekday >= 5 ? "critical" : "warning", unit, text: `${unit} no tiene auditorías esta semana (meta ${u.target}).` });
    else if (u.pending > 0 && isoWeekday >= 5)
      alerts.push({ level: "warning", unit, text: `Quedan ${u.pending} auditoría(s) en ${unit} y la semana cierra el domingo.` });
    if (u.failed > 0) alerts.push({ level: "warning", unit, text: `${u.failed} auditoría(s) fallida(s) esta semana en ${unit}.` });
    const m = monthByUnit[u.id];
    if (!m) continue;
    for (const r of m.recurrent) alerts.push({ level: "critical", unit, text: `${r.room} (${unit}) acumula ${r.failed} auditorías fallidas en 60 días.` });
    for (const [resp, n] of Object.entries(m.by_responsibility) as [Responsibility, number][])
      if (n >= 2) alerts.push({ level: "warning", unit, text: `${n} fallas del mes en ${unit} atribuidas a: ${responsibilityLabels[resp].toLowerCase()}.` });
    for (const c of m.categories)
      if (c.count >= 2 && c.count >= 2 * c.previous)
        alerts.push({ level: "info", unit, text: `Aumentan las fallas de ${failureCategories[c.category]?.toLowerCase() ?? c.category} en ${unit} (${c.count} este mes, ${c.previous} el anterior).` });
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Día ISO (1 = lunes … 7 = domingo) en Santiago. */
export function santiagoIsoWeekday(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short" }).format(now);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day) + 1;
}
