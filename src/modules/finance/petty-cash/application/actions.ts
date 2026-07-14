"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import {
  attachmentMetadataSchema,
  PettyCashActionResult,
  reportDraftSchema,
} from "./schemas";
import { chileWeek } from "../domain/petty-cash";

function friendlyError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
  console.error("[petty-cash]", message);
  if (/límite|supera/i.test(message))
    return "Esta rendición supera el saldo semanal disponible.";
  if (/comprobante/i.test(message))
    return "Cada gasto debe tener al menos un comprobante válido.";
  if (/categoría/i.test(message))
    return "La categoría seleccionada ya no está disponible.";
  if (/centro de costo/i.test(message))
    return "El centro de costo seleccionado ya no está disponible.";
  if (/permiso|autoriz|RLS|row-level|42501/i.test(message))
    return "No tienes autorización para realizar esta acción.";
  if (/estado|decidida|inmutable/i.test(message))
    return "La rendición cambió de estado y ya no admite esta operación.";
  if (/sesión|JWT|refresh/i.test(message))
    return "Tu sesión expiró. Vuelve a iniciar sesión.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}

function extension(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  return mimeType === "image/png" ? "png" : "jpg";
}

async function createContext(permission: string) {
  const ctx = await requireSession();
  if (!ctx.permissions.has(permission)) throw new Error("Permiso insuficiente");
  return ctx;
}

export async function savePettyCashDraftAction(
  _previous: PettyCashActionResult,
  form: FormData,
): Promise<PettyCashActionResult> {
  let reportId: string | undefined;
  try {
    const ctx = await createContext("finance.petty_cash.create");
    const rawLines = String(form.get("lines") ?? "[]");
    let lines: unknown;
    try {
      lines = JSON.parse(rawLines);
    } catch {
      return {
        success: false,
        message: "No fue posible leer las líneas de gasto.",
      };
    }
    const parsed = reportDraftSchema.safeParse({
      id: String(form.get("id") ?? "") || undefined,
      business_unit_id: form.get("business_unit_id"),
      week_start: form.get("week_start"),
      week_end: form.get("week_end"),
      general_reason: form.get("general_reason"),
      general_observations: form.get("general_observations"),
      lines,
    });
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      return {
        success: false,
        message: "Revisa los campos destacados.",
        fieldErrors: flattened.fieldErrors as Record<string, string[]>,
      };
    }
    const value = parsed.data;
    if (value.week_start > chileWeek().start) {
      return {
        success: false,
        message:
          "La semana seleccionada no puede ser posterior a la semana actual.",
        fieldErrors: {
          week_start: ["Selecciona la semana actual o una anterior."],
        },
      };
    }
    const unit = ctx.units.find((item) => item.id === value.business_unit_id);
    if (!unit)
      return {
        success: false,
        message: "Selecciona una unidad de negocio autorizada.",
      };
    const supabase = await createSupabaseServerClient();
    reportId = value.id;
    if (reportId) {
      const { data: report } = await supabase
        .from("petty_cash_reports")
        .select("id,responsible_id,status,business_unit_id,week_start")
        .eq("id", reportId)
        .single();
      if (
        !report ||
        report.responsible_id !== ctx.user.id ||
        !["draft", "correction_requested"].includes(report.status) ||
        report.business_unit_id !== value.business_unit_id ||
        report.week_start !== value.week_start
      )
        return {
          success: false,
          message: "Esta rendición ya no puede editarse.",
        };
      const { error } = await supabase
        .from("petty_cash_reports")
        .update({
          general_reason: value.general_reason,
          general_observations: value.general_observations || null,
        })
        .eq("id", reportId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("petty_cash_reports")
        .insert({
          company_id: unit.company_id,
          business_unit_id: unit.id,
          responsible_id: ctx.user.id,
          week_start: value.week_start,
          week_end: value.week_end,
          general_reason: value.general_reason,
          general_observations: value.general_observations || null,
          created_by: ctx.user.id,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      reportId = data.id;
    }
    if (!reportId)
      throw new Error("No fue posible identificar la rendición guardada");

    const { data: existing, error: existingError } = await supabase
      .from("petty_cash_expense_lines")
      .select("id")
      .eq("petty_cash_report_id", reportId)
      .is("deleted_at", null);
    if (existingError) throw existingError;
    const retained = new Set(
      value.lines.flatMap((line) => (line.id ? [line.id] : [])),
    );
    const removed = (existing ?? [])
      .filter((line) => !retained.has(line.id))
      .map((line) => line.id);
    if (removed.length) {
      const { data: removedAttachments } = await supabase
        .from("petty_cash_line_attachments")
        .select("object_path")
        .in("expense_line_id", removed)
        .is("deleted_at", null);
      const paths = (removedAttachments ?? []).map(
        (attachment) => attachment.object_path,
      );
      if (paths.length) {
        const { error: storageError } = await supabase.storage
          .from("petty-cash-attachments")
          .remove(paths);
        if (storageError) throw storageError;
      }
      const { error } = await supabase
        .from("petty_cash_expense_lines")
        .delete()
        .in("id", removed);
      if (error) throw error;
    }

    const uploadTargets: Array<{
      client_id: string;
      line_id: string;
      report_id: string;
    }> = [];
    for (const line of value.lines) {
      const payload = {
        expense_date: line.expense_date,
        merchant_name: line.merchant_name,
        document_type: line.document_type,
        document_number: line.document_number || null,
        expense_category_id: line.expense_category_id,
        cost_center_id: line.cost_center_id,
        description: line.description,
        amount: line.amount,
        observation: line.observation || null,
        sort_order: line.sort_order,
      };
      let lineId = line.id;
      if (lineId) {
        const { error } = await supabase
          .from("petty_cash_expense_lines")
          .update(payload)
          .eq("id", lineId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("petty_cash_expense_lines")
          .insert({
            ...payload,
            company_id: unit.company_id,
            business_unit_id: unit.id,
            petty_cash_report_id: reportId,
            created_by: ctx.user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        lineId = data.id;
      }
      if (!lineId)
        throw new Error("No fue posible identificar la línea guardada");
      uploadTargets.push({
        client_id: line.client_id,
        line_id: lineId,
        report_id: reportId,
      });
    }
    revalidatePettyCash(reportId);
    return {
      success: true,
      id: reportId,
      data: { uploadTargets },
      message: "Borrador guardado correctamente.",
    };
  } catch (error) {
    return { success: false, id: reportId, message: friendlyError(error) };
  }
}

export async function pettyCashWeekSummaryAction(
  businessUnitId: string,
  weekStart: string,
) {
  try {
    const ctx = await createContext("finance.petty_cash.create");
    const unitId = z.string().uuid().parse(businessUnitId);
    const targetWeek = z.string().date().parse(weekStart);
    if (!ctx.units.some((unit) => unit.id === unitId)) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("petty_cash_week_summary", {
      target_business_unit: unitId,
      target_week: targetWeek,
      target_responsible: ctx.user.id,
    });
    if (error) throw error;
    return data as {
      weekly_limit?: number;
      committed?: number;
      available?: number;
    };
  } catch (error) {
    console.error("[petty-cash-week-summary]", error);
    return null;
  }
}

export async function preparePettyCashAttachmentAction(input: {
  report_id: string;
  expense_line_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}): Promise<PettyCashActionResult> {
  try {
    const ctx = await createContext("finance.petty_cash.create");
    const parsed = attachmentMetadataSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        message: "El comprobante no es válido o supera 10 MB.",
      };
    }
    const supabase = await createSupabaseServerClient();
    const { data: line, error: lineError } = await supabase
      .from("petty_cash_expense_lines")
      .select(
        "id,company_id,business_unit_id,petty_cash_report_id,petty_cash_reports!inner(responsible_id,status)",
      )
      .eq("id", parsed.data.expense_line_id)
      .eq("petty_cash_report_id", parsed.data.report_id)
      .single();
    if (lineError || !line) throw lineError ?? new Error("Línea no encontrada");
    const report = Array.isArray(line.petty_cash_reports)
      ? line.petty_cash_reports[0]
      : line.petty_cash_reports;
    if (
      !report ||
      report.responsible_id !== ctx.user.id ||
      !["draft", "correction_requested"].includes(report.status)
    ) {
      throw new Error("El comprobante no se puede adjuntar en este estado");
    }
    const objectPath = `${line.company_id}/${line.petty_cash_report_id}/${line.id}/${crypto.randomUUID()}.${extension(parsed.data.mime_type)}`;
    const { data: attachment, error } = await supabase
      .from("petty_cash_line_attachments")
      .insert({
        company_id: line.company_id,
        business_unit_id: line.business_unit_id,
        petty_cash_report_id: line.petty_cash_report_id,
        expense_line_id: line.id,
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
      data: {
        attachment_id: attachment.id,
        object_path: attachment.object_path,
      },
      message: "Comprobante preparado.",
    };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function submitPettyCashReportAction(
  id: string,
): Promise<PettyCashActionResult> {
  try {
    await createContext("finance.petty_cash.create");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("submit_petty_cash_report", {
      target_report_id: id,
    });
    if (error) throw error;
    revalidatePettyCash(id);
    return {
      success: true,
      id,
      data,
      message: "Rendición enviada a revisión.",
    };
  } catch (error) {
    return { success: false, id, message: friendlyError(error) };
  }
}

export async function deletePettyCashAttachmentAction(
  id: string,
): Promise<PettyCashActionResult> {
  try {
    await createContext("finance.petty_cash.create");
    const supabase = await createSupabaseServerClient();
    const { data: attachment, error: attachmentError } = await supabase
      .from("petty_cash_line_attachments")
      .select("bucket_id,object_path")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (attachmentError) throw attachmentError;
    if (attachment.object_path) {
      const { error: storageError } = await supabase.storage
        .from(attachment.bucket_id ?? "petty-cash-attachments")
        .remove([attachment.object_path]);
      if (storageError) throw storageError;
    }
    const { error } = await supabase.rpc("delete_petty_cash_attachment", {
      target_attachment_id: id,
    });
    if (error) throw error;
    revalidatePath("/finance/petty-cash");
    return { success: true, message: "Comprobante eliminado." };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

export async function decidePettyCashReportAction(
  id: string,
  decision: "approved" | "rejected" | "correction_requested" | "comment",
  comment: string,
  observedLineIds: string[] = [],
): Promise<PettyCashActionResult> {
  try {
    await createContext("finance.petty_cash.review");
    if (
      ["rejected", "correction_requested"].includes(decision) &&
      !comment.trim()
    )
      return {
        success: false,
        message: "Debes ingresar un comentario para esta decisión.",
      };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("decide_petty_cash_report", {
      target_report_id: id,
      target_decision: decision,
      target_comment: comment.trim() || null,
      observed_line_ids: observedLineIds,
    });
    if (error) throw error;
    revalidatePettyCash(id);
    return {
      success: true,
      data,
      message:
        decision === "comment"
          ? "Comentario registrado."
          : "Decisión registrada correctamente.",
    };
  } catch (error) {
    return { success: false, message: friendlyError(error) };
  }
}

function revalidatePettyCash(id: string) {
  revalidatePath("/finance/petty-cash");
  revalidatePath("/finance/petty-cash/my-reports");
  revalidatePath("/finance/petty-cash/reviews");
  revalidatePath("/finance/petty-cash/approved");
  revalidatePath(`/finance/petty-cash/reports/${id}`);
  revalidatePath(`/finance/petty-cash/reviews/${id}`);
}
