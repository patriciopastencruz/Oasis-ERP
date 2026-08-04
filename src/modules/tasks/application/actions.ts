"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { taskCardInputSchema, type TaskActionResult } from "./schemas";
import type { TaskStatus } from "../domain/task";

function friendlyError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
  console.error("[tasks]", message);
  if (/titulo/i.test(message)) return "El título es obligatorio.";
  if (/responsable/i.test(message))
    return "El responsable no pertenece a esta compañía.";
  if (/unidad de negocio/i.test(message))
    return "La unidad de negocio seleccionada no pertenece a esta compañía.";
  if (/compania|autoriz|RLS|row-level|42501/i.test(message))
    return "No tienes autorización para realizar esta acción.";
  if (/sesión|JWT|refresh/i.test(message))
    return "Tu sesión expiró. Vuelve a iniciar sesión.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}

export async function createTaskCardAction(
  input: unknown,
): Promise<TaskActionResult> {
  try {
    await requirePermission("tasks.board.manage");
    const parsed = taskCardInputSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, message: "Revisa los campos del formulario." };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("tasks_create_card", {
      payload: parsed.data,
    });
    if (error) throw error;
    revalidatePath("/tasks");
    return { success: true, message: "Tarea creada.", id: data as string };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function updateTaskCardAction(
  id: string,
  input: unknown,
): Promise<TaskActionResult> {
  try {
    await requirePermission("tasks.board.manage");
    const parsed = taskCardInputSchema
      .omit({ company_id: true })
      .safeParse(input);
    if (!parsed.success)
      return { success: false, message: "Revisa los campos del formulario." };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("tasks_update_card", {
      target_card: id,
      payload: parsed.data,
    });
    if (error) throw error;
    revalidatePath("/tasks");
    return { success: true, message: "Tarea actualizada." };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function moveTaskCardAction(
  id: string,
  status: TaskStatus,
): Promise<TaskActionResult> {
  try {
    await requirePermission("tasks.board.manage");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("tasks_move_card", {
      target_card: id,
      target_status: status,
    });
    if (error) throw error;
    revalidatePath("/tasks");
    return { success: true, message: "Tarea movida." };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function deleteTaskCardAction(
  id: string,
): Promise<TaskActionResult> {
  try {
    await requirePermission("tasks.board.manage");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("tasks_delete_card", {
      target_card: id,
    });
    if (error) throw error;
    revalidatePath("/tasks");
    return { success: true, message: "Tarea eliminada." };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}
