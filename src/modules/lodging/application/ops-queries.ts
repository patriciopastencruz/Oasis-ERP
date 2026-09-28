import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { lodgingUnitCodes } from "@/config/business-units";
import type { OpsBoard } from "../domain/operations";
import type { AuditWeekSummary, MonthKpis } from "../domain/audits";
import type { IncidentDetail, IncidentItem } from "../domain/incidents";

export const OPS_UNIT_COOKIE = "oasis_ops_unit";
const OPS_PERMISSIONS = ["lodging.housekeeping.view", "lodging.rooms.inspect", "lodging.operations.view"];

/**
 * Contexto del portal operativo. El acceso real lo validan las funciones de
 * base de datos con auth.uid(), user_business_units y permisos; aquí solo se
 * elige qué unidad mostrar entre las asignadas (nunca se confía en el cliente).
 */
export async function opsContext() {
  const ctx = await requireSession();
  if (!OPS_PERMISSIONS.some((p) => ctx.permissions.has(p))) redirect("/no-access");
  const units = ctx.units
    .filter((u) => lodgingUnitCodes.includes(u.code))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  if (!units.length) redirect("/no-access");
  const saved = (await cookies()).get(OPS_UNIT_COOKIE)?.value;
  const unit = units.find((u) => u.id === saved) ?? units[0];
  const can = {
    clean: ctx.permissions.has("lodging.housekeeping.execute"),
    inspect: ctx.permissions.has("lodging.rooms.inspect"),
    operations: ctx.permissions.has("lodging.operations.view"),
    audit: ctx.permissions.has("lodging.audits.execute"),
    auditView: ctx.permissions.has("lodging.audits.view") || ctx.permissions.has("lodging.audits.execute"),
    // Mantención: ver la lista de incidencias y gestionarlas (asignar, resolver, bloquear).
    maintenanceView: ["lodging.maintenance.view", "lodging.maintenance.manage", "lodging.operations.view", "lodging.audits.view"].some((p) => ctx.permissions.has(p)),
    maintenanceManage: ctx.permissions.has("lodging.maintenance.manage"),
    // Bloquear por mantención: recepción (inspección) o administración; fuera de servicio solo administración.
    blockMaintenance: ctx.permissions.has("lodging.rooms.inspect") || ctx.permissions.has("lodging.maintenance.manage"),
    report: ["lodging.housekeeping.execute", "lodging.rooms.inspect", "lodging.maintenance.view", "lodging.maintenance.manage", "lodging.operations.view", "lodging.audits.execute"].some((p) =>
      ctx.permissions.has(p),
    ),
  };
  return { ctx, units, unit, can, supabase: await createSupabaseServerClient() };
}

/** Procesa salidas sin check-out y devuelve el tablero operacional de la unidad. */
export async function loadBoard(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, unitId: string) {
  const sync = await supabase.rpc("lodging_ops_sync_departures", { target_unit: unitId });
  if (sync.error) console.error("[ops] sync departures", sync.error.message);
  const { data, error } = await supabase.rpc("lodging_ops_board", { target_unit: unitId });
  if (error) throw error;
  return data as OpsBoard;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Auditorías de la semana de todos los hostales asignados (lunes a domingo). */
export async function loadAuditWeek(supabase: Supabase, week?: string) {
  const { data, error } = await supabase.rpc("lodging_audit_week_summary", { target_week: week ?? null });
  if (error) throw error;
  return data as AuditWeekSummary;
}

export async function loadAuditMonth(supabase: Supabase, unitId: string, month: string) {
  const { data, error } = await supabase.rpc("lodging_audit_month_kpis", { target_unit: unitId, target_month: `${month}-01` });
  if (error) throw error;
  return data as MonthKpis;
}

export type AuditDetail = {
  id: string;
  status: "in_progress" | "passed" | "failed" | "skipped";
  unit_id: string;
  room_id: string;
  room_name: string;
  room_type: string;
  operational_status: string;
  week_start: string;
  selected_at: string;
  audited_at: string | null;
  supervisor_id: string;
  housekeeper: string | null;
  inspector: string | null;
  cleaned_at: string | null;
  duration_minutes: number | null;
  inspected_at: string | null;
  checklist: Record<string, string> | null;
  notes: string | null;
  responsibility: string | null;
  failure_category: string | null;
  severity: string | null;
  action: string | null;
  occupied_now: boolean;
};

export async function loadAudit(supabase: Supabase, id: string) {
  const { data, error } = await supabase.rpc("lodging_audit_detail", { target_audit: id });
  if (error) return null;
  return data as AuditDetail;
}

export type RoomHistory = {
  room: { id: string; name: string; room_type: string; operational_status: string };
  items: { at: string; kind: "cleaning" | "inspection" | "audit" | "incident"; data: Record<string, string | number | null> }[];
};

export async function loadRoomHistory(supabase: Supabase, roomId: string) {
  const { data, error } = await supabase.rpc("lodging_room_history", { target_room: roomId, max_items: 80 });
  if (error) return null;
  return data as RoomHistory;
}

/** Incidencias abiertas y resueltas de los últimos 14 días de la unidad. */
export async function loadIncidents(supabase: Supabase, unitId: string) {
  const { data, error } = await supabase.rpc("lodging_incident_board", { target_unit: unitId });
  if (error) throw error;
  return data as IncidentItem[];
}

export async function loadIncident(supabase: Supabase, id: string) {
  const { data, error } = await supabase.rpc("lodging_incident_detail", { target_incident: id });
  if (error) return null;
  return data as IncidentDetail;
}

/** Fotos con URL firmada de corta duración (bucket privado). */
export async function signedPhotos(supabase: Supabase, detail: IncidentDetail) {
  if (!detail.attachments.length) return [];
  const { data } = await supabase.storage.from("lodging-operations").createSignedUrls(detail.attachments.map((a) => a.path), 600);
  return detail.attachments.map((a, i) => ({ ...a, url: data?.[i]?.signedUrl ?? null }));
}

export async function loadUnitStaff(supabase: Supabase, unitId: string) {
  const { data, error } = await supabase.rpc("lodging_unit_staff", { target_unit: unitId });
  if (error) return [];
  return data as { staff_id: string; staff_name: string; staff_role: string | null }[];
}
