"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { projectsContext } from "@/modules/sales/projects/application/queries";
import { validateProjectAttachment } from "@/modules/sales/projects/application/schemas";

const uuid = z.string().uuid();
const BUCKET = "modular-project-attachments";

function done(path: string, type: "success" | "error", message: string): never {
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}
function errorMessage(error: { message?: string } | null) {
  const value = error?.message ?? "No fue posible completar la operación.";
  if (/autoriz|permission|row-level/i.test(value))
    return "No tienes autorización para esta acción.";
  return value;
}
function extension(file: File) {
  const value = file.name.split(".").pop()?.toLowerCase();
  if (value && ["pdf", "jpg", "jpeg", "png"].includes(value)) return value;
  return file.type === "application/pdf" ? "pdf" : "jpg";
}

function projectPayload(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    client_company: String(form.get("client_company") ?? ""),
    client_rut: String(form.get("client_rut") ?? ""),
    client_contact: String(form.get("client_contact") ?? ""),
    client_email: String(form.get("client_email") ?? ""),
    client_place: String(form.get("client_place") ?? ""),
    execution_address: String(form.get("execution_address") ?? ""),
    responsible_id: String(form.get("responsible_id") ?? ""),
    net_income: Number(form.get("net_income") ?? 0),
    estimated_start_date: String(form.get("estimated_start_date") ?? ""),
    estimated_end_date: String(form.get("estimated_end_date") ?? ""),
    notes: String(form.get("notes") ?? ""),
  };
}

export async function createProjectAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.create");
  const { data, error } = await supabase.rpc("om_create_project", {
    payload: projectPayload(form),
  });
  if (error) done("/sales/projects/new", "error", errorMessage(error));
  revalidatePath("/sales/projects");
  done(`/sales/projects/${data}`, "success", "Proyecto creado.");
}

export async function convertQuotationToProjectAction(form: FormData) {
  const { supabase } = await projectsContext(
    "sales.projects.convert_from_quotation",
  );
  const quotationId = uuid.parse(form.get("quotation_id"));
  const payload = {
    ...projectPayload(form),
    execution_address: String(form.get("execution_address") ?? ""),
  };
  delete (payload as Record<string, unknown>).client_company;
  delete (payload as Record<string, unknown>).client_rut;
  delete (payload as Record<string, unknown>).client_contact;
  delete (payload as Record<string, unknown>).client_email;
  delete (payload as Record<string, unknown>).client_place;
  delete (payload as Record<string, unknown>).net_income;
  const { data, error } = await supabase.rpc(
    "om_convert_quotation_to_project",
    { target_quotation: quotationId, payload },
  );
  if (error)
    done(
      `/sales/quotations/${quotationId}`,
      "error",
      errorMessage(error),
    );
  revalidatePath("/sales/projects");
  revalidatePath(`/sales/quotations/${quotationId}`);
  done(`/sales/projects/${data}`, "success", "Proyecto creado desde la cotización.");
}

export async function updateProjectAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.update");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}`;
  const { error } = await supabase.rpc("om_update_project", {
    target_project: id,
    payload: projectPayload(form),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/projects");
  revalidatePath(returnPath);
  done(returnPath, "success", "Proyecto actualizado.");
}

export async function setProjectResponsibleAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_team");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}?tab=equipo`;
  const { error } = await supabase.rpc("om_set_project_responsible", {
    target_project: id,
    new_responsible: String(form.get("responsible_id") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Responsable actualizado.");
}

export async function addProjectMemberAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_team");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}?tab=equipo`;
  const { error } = await supabase.rpc("om_add_project_member", {
    target_project: id,
    payload: {
      member_type: String(form.get("member_type") ?? ""),
      profile_id: String(form.get("profile_id") ?? ""),
      external_name: String(form.get("external_name") ?? ""),
      role: String(form.get("role") ?? ""),
      note: String(form.get("note") ?? ""),
    },
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Integrante agregado.");
}

export async function removeProjectMemberAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_team");
  const memberId = uuid.parse(form.get("member_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=equipo`;
  const { error } = await supabase.rpc("om_remove_project_member", {
    target_member: memberId,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Integrante eliminado.");
}

export async function changeProjectStatusAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.update");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}`;
  const targetStatus = String(form.get("target_status") ?? "");
  const { error } = await supabase.rpc("om_change_project_status", {
    target_project: id,
    target_status: targetStatus,
    comment_text: String(form.get("comment") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/projects");
  revalidatePath(returnPath);
  done(returnPath, "success", "Estado actualizado.");
}

export async function closeProjectAction(form: FormData) {
  const { ctx, supabase } = await projectsContext("sales.projects.close");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}`;
  const { data: project, error: loadError } = await supabase
    .from("om_projects")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !project)
    done(returnPath, "error", "No fue posible cargar el proyecto.");
  const { error } = await supabase.rpc("om_close_project", {
    target_project: id,
    actual_end: String(form.get("actual_end_date") ?? ""),
    closure_notes_text: String(form.get("closure_notes") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));

  for (const [field, documentType] of [
    ["receipt_file", "recepcion_conforme"],
    ["invoice_file", "factura"],
  ] as const) {
    const file = form.get(field);
    if (file instanceof File && file.size > 0) {
      const invalid = validateProjectAttachment(file);
      if (invalid) continue;
      const path = `${project!.company_id}/${id}/documents/${crypto.randomUUID()}.${extension(file)}`;
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (!upload.error) {
        const meta = await supabase.from("om_project_documents").insert({
          company_id: project!.company_id,
          project_id: id,
          document_type: documentType,
          name: file.name,
          object_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: ctx.user.id,
        });
        if (meta.error) await supabase.storage.from(BUCKET).remove([path]);
      }
    }
  }
  revalidatePath("/sales/projects");
  revalidatePath(returnPath);
  done(returnPath, "success", "Proyecto cerrado.");
}

export async function reopenProjectAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.reopen");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}`;
  const { error } = await supabase.rpc("om_reopen_project", {
    target_project: id,
    comment_text: String(form.get("comment") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/projects");
  revalidatePath(returnPath);
  done(returnPath, "success", "Proyecto reabierto.");
}

export async function cancelProjectAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.cancel");
  const id = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${id}`;
  const { error } = await supabase.rpc("om_cancel_project", {
    target_project: id,
    reason: String(form.get("reason") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/projects");
  revalidatePath(returnPath);
  done(returnPath, "success", "Proyecto cancelado.");
}

export async function createProjectExpenseAction(form: FormData) {
  const { ctx, supabase } = await projectsContext(
    "sales.projects.manage_expenses",
  );
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=gastos`;
  const { data: expenseId, error } = await supabase.rpc(
    "om_create_project_expense",
    {
      payload: {
        project_id: projectId,
        expense_date: String(form.get("expense_date") ?? ""),
        category: String(form.get("category") ?? ""),
        description: String(form.get("description") ?? ""),
        supplier_name: String(form.get("supplier_name") ?? ""),
        supplier_rut: String(form.get("supplier_rut") ?? ""),
        document_type: String(form.get("document_type") ?? ""),
        document_number: String(form.get("document_number") ?? ""),
        is_exempt: form.get("is_exempt") === "on",
        net_amount: Number(form.get("net_amount") ?? 0),
        payment_method: String(form.get("payment_method") ?? ""),
        notes: String(form.get("notes") ?? ""),
      },
    },
  );
  if (error) done(returnPath, "error", errorMessage(error));

  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    const invalid = validateProjectAttachment(file);
    if (!invalid) {
      const { data: project } = await supabase
        .from("om_projects")
        .select("company_id")
        .eq("id", projectId)
        .maybeSingle();
      if (project) {
        const path = `${project.company_id}/${projectId}/expenses/${expenseId}/${crypto.randomUUID()}.${extension(file)}`;
        const upload = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (!upload.error) {
          const meta = await supabase
            .from("om_project_expense_attachments")
            .insert({
              company_id: project.company_id,
              expense_id: expenseId,
              object_path: path,
              original_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              uploaded_by: ctx.user.id,
            });
          if (meta.error) await supabase.storage.from(BUCKET).remove([path]);
        }
      }
    }
  }
  revalidatePath(returnPath);
  done(returnPath, "success", "Gasto registrado.");
}

export async function updateProjectExpenseAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_expenses");
  const expenseId = uuid.parse(form.get("expense_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=gastos`;
  const { error } = await supabase.rpc("om_update_project_expense", {
    target_expense: expenseId,
    payload: {
      expense_date: String(form.get("expense_date") ?? ""),
      category: String(form.get("category") ?? ""),
      description: String(form.get("description") ?? ""),
      supplier_name: String(form.get("supplier_name") ?? ""),
      supplier_rut: String(form.get("supplier_rut") ?? ""),
      document_type: String(form.get("document_type") ?? ""),
      document_number: String(form.get("document_number") ?? ""),
      is_exempt: form.get("is_exempt") === "on",
      net_amount: Number(form.get("net_amount") ?? 0),
      payment_method: String(form.get("payment_method") ?? ""),
      notes: String(form.get("notes") ?? ""),
    },
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Gasto actualizado.");
}

export async function voidProjectExpenseAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_expenses");
  const expenseId = uuid.parse(form.get("expense_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=gastos`;
  const { error } = await supabase.rpc("om_void_project_expense", {
    target_expense: expenseId,
    reason: String(form.get("reason") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Gasto anulado.");
}

export async function deleteExpenseAttachmentAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_expenses");
  const attachmentId = uuid.parse(form.get("attachment_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=gastos`;
  const { data: attachment } = await supabase
    .from("om_project_expense_attachments")
    .select("object_path")
    .eq("id", attachmentId)
    .maybeSingle();
  const { error } = await supabase
    .from("om_project_expense_attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) done(returnPath, "error", errorMessage(error));
  if (attachment) await supabase.storage.from(BUCKET).remove([attachment.object_path]);
  revalidatePath(returnPath);
  done(returnPath, "success", "Respaldo eliminado.");
}

export async function uploadProjectDocumentAction(form: FormData) {
  const { ctx, supabase } = await projectsContext(
    "sales.projects.manage_documents",
  );
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=documentos`;
  const file = form.get("document");
  if (!(file instanceof File) || file.size === 0)
    done(returnPath, "error", "Selecciona un archivo.");
  const invalid = validateProjectAttachment(file as File);
  if (invalid) done(returnPath, "error", invalid);
  const { data: project } = await supabase
    .from("om_projects")
    .select("company_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) done(returnPath, "error", "No fue posible cargar el proyecto.");
  const path = `${project!.company_id}/${projectId}/documents/${crypto.randomUUID()}.${extension(file as File)}`;
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, file as File, {
      contentType: (file as File).type,
      upsert: false,
    });
  if (upload.error) done(returnPath, "error", errorMessage(upload.error));
  const meta = await supabase.from("om_project_documents").insert({
    company_id: project!.company_id,
    project_id: projectId,
    document_type: String(form.get("document_type") ?? "otro"),
    name: String(form.get("name") ?? (file as File).name),
    description: String(form.get("description") ?? ""),
    object_path: path,
    mime_type: (file as File).type,
    size_bytes: (file as File).size,
    uploaded_by: ctx.user.id,
  });
  if (meta.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    done(returnPath, "error", errorMessage(meta.error));
  }
  revalidatePath(returnPath);
  done(returnPath, "success", "Documento subido.");
}

export async function deleteProjectDocumentAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.manage_documents");
  const documentId = uuid.parse(form.get("document_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=documentos`;
  const { data: doc } = await supabase
    .from("om_project_documents")
    .select("object_path")
    .eq("id", documentId)
    .maybeSingle();
  const { error } = await supabase
    .from("om_project_documents")
    .delete()
    .eq("id", documentId);
  if (error) done(returnPath, "error", errorMessage(error));
  if (doc) await supabase.storage.from(BUCKET).remove([doc.object_path]);
  revalidatePath(returnPath);
  done(returnPath, "success", "Documento eliminado.");
}

export async function addProjectNoteAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.add_notes");
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=observaciones`;
  const { error } = await supabase.rpc("om_add_project_note", {
    target_project: projectId,
    body_text: String(form.get("body") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Observación registrada.");
}

export async function editProjectNoteAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.add_notes");
  const noteId = uuid.parse(form.get("note_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=observaciones`;
  const { error } = await supabase.rpc("om_edit_project_note", {
    target_note: noteId,
    body_text: String(form.get("body") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Observación editada.");
}

export async function deleteProjectNoteAction(form: FormData) {
  const { supabase } = await projectsContext("sales.projects.add_notes");
  const noteId = uuid.parse(form.get("note_id"));
  const projectId = uuid.parse(form.get("project_id"));
  const returnPath = `/sales/projects/${projectId}?tab=observaciones`;
  const { error } = await supabase.rpc("om_delete_project_note", {
    target_note: noteId,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(returnPath, "success", "Observación eliminada.");
}
