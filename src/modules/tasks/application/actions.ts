"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  attachmentMetadataSchema,
  taskCardInputSchema,
  type TaskActionResult,
} from "./schemas";
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

function extension(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  return mimeType === "image/png" ? "png" : "jpg";
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
    // No exige 'manage': tasks_move_card autoriza al responsable de la
    // tarjeta o a quien tenga 'manage'; aquí solo se exige acceso mínimo
    // al tablero para no dejar la acción abierta a cualquier sesión.
    await requirePermission("tasks.board.view");
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

export async function prepareTaskAttachmentAction(input: {
  task_card_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}): Promise<TaskActionResult> {
  try {
    const ctx = await requirePermission("tasks.board.view");
    const parsed = attachmentMetadataSchema.safeParse(input);
    if (!parsed.success)
      return {
        success: false,
        message: "El archivo no es válido o supera 10 MB.",
      };
    const supabase = await createSupabaseServerClient();
    const { data: card, error: cardError } = await supabase
      .from("task_cards")
      .select("id,company_id")
      .eq("id", parsed.data.task_card_id)
      .single();
    if (cardError || !card) throw cardError ?? new Error("Tarea no encontrada");
    const objectPath = `${card.company_id}/${card.id}/${crypto.randomUUID()}.${extension(parsed.data.mime_type)}`;
    const { data: attachment, error } = await supabase
      .from("task_card_attachments")
      .insert({
        company_id: card.company_id,
        task_card_id: card.id,
        object_path: objectPath,
        original_name: parsed.data.original_name,
        mime_type: parsed.data.mime_type,
        size_bytes: parsed.data.size_bytes,
        uploaded_by: ctx.user.id,
      })
      .select("id,object_path")
      .single();
    if (error) throw error;
    return {
      success: true,
      id: attachment.id,
      data: { attachment_id: attachment.id, object_path: attachment.object_path },
      message: "Adjunto preparado.",
    };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function deleteTaskAttachmentAction(
  id: string,
): Promise<TaskActionResult> {
  try {
    await requirePermission("tasks.board.view");
    const supabase = await createSupabaseServerClient();
    const { data: attachment, error: attachmentError } = await supabase
      .from("task_card_attachments")
      .select("object_path")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (attachmentError) throw attachmentError;
    const { error: storageError } = await supabase.storage
      .from("task-card-attachments")
      .remove([attachment.object_path]);
    if (storageError) throw storageError;
    const { error } = await supabase
      .from("task_card_attachments")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/tasks");
    return { success: true, message: "Adjunto eliminado." };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function getTaskAttachmentUrlAction(
  id: string,
): Promise<TaskActionResult> {
  try {
    await requirePermission("tasks.board.view");
    const supabase = await createSupabaseServerClient();
    const { data: attachment, error: attachmentError } = await supabase
      .from("task_card_attachments")
      .select("object_path,original_name")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (attachmentError) throw attachmentError;
    const { data, error } = await supabase.storage
      .from("task-card-attachments")
      .createSignedUrl(attachment.object_path, 300, {
        download: attachment.original_name,
      });
    if (error) throw error;
    return { success: true, message: "", data: { url: data.signedUrl } };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}
