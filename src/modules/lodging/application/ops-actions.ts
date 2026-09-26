"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { OPS_UNIT_COOKIE, opsContext } from "./ops-queries";
import { checklistFrom, housekeepingChecklist, inspectionChecklist } from "../domain/operations";

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
  if (/autoriz|no autorizada|permission|42501/i.test(message)) return "No tienes permiso para esta acción.";
  return "No fue posible completar la acción. Intenta nuevamente.";
}

/** Cambia el hostal visible del portal; solo entre las unidades asignadas. */
export async function selectOpsUnitAction(form: FormData) {
  const { units } = await opsContext();
  const id = String(form.get("unit_id") ?? "");
  if (!units.some((u) => u.id === id)) go("/ops", "error", "Hostal no autorizado.");
  (await cookies()).set(OPS_UNIT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  redirect("/ops");
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
