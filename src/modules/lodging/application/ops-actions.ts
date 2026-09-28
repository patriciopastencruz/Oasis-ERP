"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { OPS_UNIT_COOKIE, opsContext } from "./ops-queries";
import { checklistFrom, housekeepingChecklist, inspectionChecklist } from "../domain/operations";
import { auditChecklistFrom } from "../domain/audits";
import { MAX_PHOTO_BYTES, MAX_PHOTOS } from "../domain/incidents";
import { detectedMime } from "../domain/receipts";

const uuid = z.string().uuid();

function go(path: string, key: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function friendly(error: { message?: string } | null) {
  const message = error?.message ?? "";
  console.error("[ops]", message);
  const taken = message.match(/siendo limpiada por (.+)$/i);
  if (taken) return `Esta habitación ya la está limpiando ${taken[1]}.`;
  if (/no esta pendiente de limpieza/i.test(message)) return "Esta habitación ya no está pendiente de limpieza.";
  if (/no esta en curso/i.test(message)) return "Esta limpieza ya fue finalizada.";
  if (/solo quien comenzo/i.test(message)) return "Solo quien comenzó la limpieza puede finalizarla.";
  if (/no esta pendiente de inspeccion/i.test(message)) return "Esta habitación ya no está pendiente de inspección.";
  if (/motivo del rechazo/i.test(message)) return "Indica el motivo del rechazo.";
  if (/no hay habitaciones auditables/i.test(message)) return "Ahora no hay habitaciones auditables: todas están ocupadas, sin inspeccionar o ya auditadas esta semana.";
  if (/observacion es obligatoria/i.test(message)) return "Si hay una falla, la observación es obligatoria.";
  if (/origen de la falla|categoria|gravedad|accion/i.test(message)) return "Completa origen, categoría, gravedad y acción de la falla.";
  if (/auditoria ya fue cerrada/i.test(message)) return "Esta auditoría ya fue cerrada.";
  if (/para bloquear|fuera de servicio/i.test(message)) return "No tienes permiso para bloquear la habitación de esa forma.";
  if (/describe el problema/i.test(message)) return "Describe brevemente el problema.";
  if (/como se resolvio/i.test(message)) return "Indica qué se hizo para resolverla.";
  if (/indica el motivo/i.test(message)) return "Indica el motivo de la cancelación.";
  if (/ya esta cerrada/i.test(message)) return "Esta incidencia ya está cerrada.";
  if (/responsable invalido/i.test(message)) return "Esa persona no pertenece a este hostal.";
  if (/maximo 5 fotos/i.test(message)) return `Máximo ${MAX_PHOTOS} fotos por incidencia.`;
  if (/autoriz|no autorizada|permission|42501/i.test(message)) return "No tienes permiso para esta acción.";
  return "No fue posible completar la acción. Intenta nuevamente.";
}

/** Cambia el hostal visible del portal; solo entre las unidades asignadas. */
export async function selectOpsUnitAction(form: FormData) {
  const { units } = await opsContext();
  const id = String(form.get("unit_id") ?? "");
  if (!units.some((u) => u.id === id)) go("/ops", "error", "Hostal no autorizado.");
  (await cookies()).set(OPS_UNIT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  // Desde "Requiere atención" se cambia de hostal y se va directo a resolver (solo rutas del portal).
  const next = String(form.get("next") ?? "");
  redirect(/^\/ops(\/[\w\-/?=&]*)?$/.test(next) ? next : "/ops");
}

export async function startCleaningAction(form: FormData) {
  const { supabase } = await opsContext();
  const room = uuid.safeParse(form.get("room_id"));
  if (!room.success) go("/ops", "error", "Habitación inválida.");
  const { data, error } = await supabase.rpc("lodging_housekeeping_start", { target_room: room.data });
  if (error) go("/ops", "error", friendly(error));
  revalidatePath("/ops");
  redirect(`/ops/clean/${data}`);
}

export async function finishCleaningAction(form: FormData) {
  const { supabase } = await opsContext();
  const task = uuid.safeParse(form.get("task_id"));
  if (!task.success) go("/ops", "error", "Limpieza inválida.");
  const checked = new Set(form.getAll("ok").map(String));
  const checklist = checklistFrom(housekeepingChecklist, checked, form.get("all_ok") === "1");
  const { error } = await supabase.rpc("lodging_housekeeping_finish", {
    target_task: task.data,
    checklist,
    finish_notes: String(form.get("notes") ?? "").trim().slice(0, 1000),
  });
  if (error) go(`/ops/clean/${task.data}`, "error", friendly(error));
  revalidatePath("/ops");
  go("/ops", "success", "Limpieza finalizada. Queda pendiente de inspección.");
}

export async function inspectRoomAction(form: FormData) {
  const { supabase } = await opsContext();
  const room = uuid.safeParse(form.get("room_id"));
  if (!room.success) go("/ops", "error", "Habitación inválida.");
  const approved = form.get("decision") === "approve";
  const reason = String(form.get("reason") ?? "").trim();
  if (!approved && !reason) go(`/ops/inspect/${room.data}`, "error", "Elige el motivo del rechazo.");
  const checked = new Set(form.getAll("ok").map(String));
  const { error } = await supabase.rpc("lodging_room_inspect", {
    target_room: room.data,
    approved,
    checklist: checklistFrom(inspectionChecklist, checked, approved && form.get("all_ok") === "1"),
    reason: approved ? null : reason,
    inspection_notes: String(form.get("notes") ?? "").trim().slice(0, 1000),
  });
  if (error) go(`/ops/inspect/${room.data}`, "error", friendly(error));
  revalidatePath("/ops");
  go("/ops", "success", approved ? "Habitación aprobada: queda lista para check-in." : "Inspección rechazada: la habitación volvió a aseo.");
}

/** REALIZAR AUDITORÍA: el sistema elige la habitación en este momento (riesgo + azar). */
export async function drawAuditAction(form: FormData) {
  const { units, supabase } = await opsContext();
  const id = String(form.get("unit_id") ?? "");
  if (!units.some((u) => u.id === id)) go("/ops", "error", "Hostal no autorizado.");
  const { data, error } = await supabase.rpc("lodging_audit_draw", { target_unit: id });
  if (error) go("/ops", "error", friendly(error));
  redirect(`/ops/audit/${data}`);
}

export async function submitAuditAction(form: FormData) {
  const { supabase } = await opsContext();
  const audit = uuid.safeParse(form.get("audit_id"));
  if (!audit.success) go("/ops", "error", "Auditoría inválida.");
  const checklist = auditChecklistFrom((k) => (form.get(k) as string | null) ?? null);
  const failed = Object.values(checklist).includes("fail");
  const text = (k: string) => String(form.get(k) ?? "").trim() || null;
  const { error } = await supabase.rpc("lodging_audit_submit", {
    target_audit: audit.data,
    checklist,
    audit_notes: (text("notes") ?? "").slice(0, 1000),
    v_responsibility: failed ? text("responsibility") : null,
    v_category: failed ? text("category") : null,
    v_severity: failed ? text("severity") : null,
    v_action: failed ? text("action") : null,
  });
  if (error) go(`/ops/audit/${audit.data}`, "error", friendly(error));
  revalidatePath("/ops");
  go("/ops", "success", failed ? "Auditoría registrada como fallida." : "Auditoría aprobada.");
}

/** La habitación no está disponible (huésped, uso): se descarta con motivo y se elige otra. */
export async function skipAuditAction(form: FormData) {
  const { supabase } = await opsContext();
  const audit = uuid.safeParse(form.get("audit_id"));
  const unit = uuid.safeParse(form.get("unit_id"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!audit.success || !unit.success) go("/ops", "error", "Auditoría inválida.");
  if (reason.length < 3) go(`/ops/audit/${audit.data}`, "error", "Indica por qué no se puede auditar.");
  const { error } = await supabase.rpc("lodging_audit_skip", { target_audit: audit.data, reason });
  if (error) go(`/ops/audit/${audit.data}`, "error", friendly(error));
  const next = await supabase.rpc("lodging_audit_draw", { target_unit: unit.data });
  if (next.error) go("/ops", "error", friendly(next.error));
  redirect(`/ops/audit/${next.data}`);
}

type Supabase = Awaited<ReturnType<typeof opsContext>>["supabase"];

/**
 * Sube las fotos al bucket privado con la sesión del usuario (la política de
 * Storage valida unidad y quién reportó) y las registra en la incidencia.
 * El tipo se detecta por contenido, no por extensión. Devuelve cuántas quedaron.
 */
async function uploadPhotos(supabase: Supabase, companyId: string, unitId: string, incidentId: string, files: File[]) {
  let saved = 0;
  for (const file of files.slice(0, MAX_PHOTOS)) {
    if (file.size < 1 || file.size > MAX_PHOTO_BYTES) continue;
    const mime = detectedMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") continue;
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
    const path = `${companyId}/${unitId}/${incidentId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("lodging-operations").upload(path, file, { contentType: mime, upsert: false });
    if (up.error) {
      console.error("[ops] photo upload", up.error.message);
      continue;
    }
    const { error } = await supabase.rpc("lodging_incident_attach", {
      target_incident: incidentId,
      object_path: path,
      mime,
      size_bytes: file.size,
      original_name: file.name.slice(0, 200) || "foto",
    });
    if (error) {
      await supabase.storage.from("lodging-operations").remove([path]);
      if (/maximo 5 fotos/i.test(error.message)) break;
      continue;
    }
    saved++;
  }
  return saved;
}

const photosFrom = (form: FormData) => form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

/** REPORTAR PROBLEMA: aseo, recepción o administración, en menos de 30 segundos. */
export async function reportIncidentAction(form: FormData) {
  const { units, supabase } = await opsContext();
  const unitId = String(form.get("unit_id") ?? "");
  const unit = units.find((u) => u.id === unitId);
  const room = String(form.get("room_id") ?? "");
  const back = `/ops/report${room ? `?room=${encodeURIComponent(room)}` : ""}`;
  if (!unit) go("/ops", "error", "Hostal no autorizado.");
  if (room && !uuid.safeParse(room).success) go("/ops", "error", "Habitación inválida.");
  const category = String(form.get("category") ?? "");
  if (!category) go(back, "error", "Elige qué tipo de problema es.");
  const description = String(form.get("description") ?? "").trim().slice(0, 1000);
  const block = String(form.get("block") ?? "");
  const { data, error } = await supabase.rpc("lodging_incident_report", {
    payload: {
      unit_id: unit.id,
      room_id: room || null,
      category,
      description,
      priority: String(form.get("priority") ?? "medium"),
      block: block || null,
    },
  });
  if (error) go(back, "error", friendly(error));
  const photos = photosFrom(form);
  const saved = photos.length ? await uploadPhotos(supabase, unit.company_id, unit.id, data as string, photos) : 0;
  revalidatePath("/ops");
  const photoNote = photos.length ? (saved === photos.length ? ` con ${saved} foto${saved === 1 ? "" : "s"}` : ` (${photos.length - saved} foto(s) no se pudieron subir)`) : "";
  go("/ops", "success", `Problema reportado${photoNote}.${block ? " La habitación quedó bloqueada." : ""}`);
}

export async function addIncidentPhotosAction(form: FormData) {
  const { units, supabase } = await opsContext();
  const id = uuid.safeParse(form.get("incident_id"));
  if (!id.success) go("/ops/incidents", "error", "Incidencia inválida.");
  const unit = units.find((u) => u.id === form.get("unit_id"));
  if (!unit) go("/ops", "error", "Hostal no autorizado.");
  const photos = photosFrom(form);
  if (!photos.length) go(`/ops/incidents/${id.data}`, "error", "Elige al menos una foto.");
  const saved = await uploadPhotos(supabase, unit.company_id, unit.id, id.data, photos);
  go(`/ops/incidents/${id.data}`, saved ? "success" : "error", saved ? "Fotos agregadas." : "No se pudieron subir las fotos (JPG, PNG o WEBP, máximo 5).");
}

const incidentMessages: Record<string, string> = {
  assign: "Incidencia asignada.",
  start: "Incidencia en curso.",
  resolve: "Incidencia resuelta. Si bloqueaba la habitación, queda pendiente de inspección.",
  cancel: "Incidencia cancelada.",
  block: "Habitación bloqueada.",
  unblock: "Habitación liberada: queda pendiente de inspección.",
};

/** Gestión de administración: la base valida permiso, unidad y transición. */
export async function updateIncidentAction(form: FormData) {
  const { supabase } = await opsContext();
  const id = uuid.safeParse(form.get("incident_id"));
  if (!id.success) go("/ops/incidents", "error", "Incidencia inválida.");
  const action = String(form.get("action") ?? "");
  if (!(action in incidentMessages)) go(`/ops/incidents/${id.data}`, "error", "Acción inválida.");
  const text = (k: string) => String(form.get(k) ?? "").trim().slice(0, 1000);
  const { error } = await supabase.rpc("lodging_incident_update", {
    target_incident: id.data,
    v_action: action,
    payload: { assigned_to: text("assigned_to"), notes: text("notes"), reason: text("reason"), kind: text("kind") },
  });
  if (error) go(`/ops/incidents/${id.data}`, "error", friendly(error));
  revalidatePath("/ops");
  go(`/ops/incidents/${id.data}`, "success", incidentMessages[action]);
}
