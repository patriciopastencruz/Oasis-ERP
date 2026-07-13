"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import {
  ActionResult,
  MAX_ATTACHMENT_COUNT,
  paymentRequestSchema,
  validateAttachment,
} from "./schemas";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[payment-control]", message);
  if (/flujo.*ambigu/i.test(message))
    return "Existe más de un workflow aplicable. Contacta a un administrador.";
  if (/No existe flujo/i.test(message))
    return "No existe un workflow configurado para esta solicitud.";
  if (/respaldo/i.test(message))
    return "Debes adjuntar al menos un respaldo válido.";
  if (/permission|permis|authorized|RLS|row-level|42501/i.test(message))
    return "No tienes autorización para realizar esta acción.";
  if (/sesión|JWT|refresh/i.test(message))
    return "Tu sesión expiró. Vuelve a iniciar sesión.";
  return "No fue posible completar la operación. Intenta nuevamente.";
}
async function context() {
  const ctx = await requireSession();
  if (!ctx.permissions.has("finance.payment_requests.create"))
    throw new Error("Permiso insuficiente");
  return ctx;
}
function extension(file: File) {
  const value = file.name.split(".").pop()?.toLowerCase();
  return value && ["pdf", "jpg", "jpeg", "png"].includes(value)
    ? value
    : file.type === "application/pdf"
      ? "pdf"
      : "jpg";
}

export async function savePaymentRequestAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await context();
    const supabase = await createSupabaseServerClient();
    const raw = Object.fromEntries(form);
    const parsed = paymentRequestSchema.safeParse(raw);
    if (!parsed.success)
      return {
        success: false,
        message: "Revisa los campos destacados.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    const v = parsed.data;
    if (
      !ctx.companies.some((c) => c.id === v.company_id) ||
      !ctx.units.some(
        (u) => u.id === v.business_unit_id && u.company_id === v.company_id,
      )
    )
      return {
        success: false,
        message: "La empresa o unidad no pertenece a tu contexto autorizado.",
      };
    const [{ data: supplier }, { data: category }, { data: center }] =
      await Promise.all([
        supabase
          .from("suppliers")
          .select("id,company_id,rut,legal_name")
          .eq("id", v.supplier_id)
          .eq("company_id", v.company_id)
          .single(),
        supabase
          .from("expense_categories")
          .select("id")
          .eq("id", v.expense_category_id)
          .eq("company_id", v.company_id)
          .or(
            `business_unit_id.is.null,business_unit_id.eq.${v.business_unit_id}`,
          )
          .single(),
        supabase
          .from("cost_centers")
          .select("id")
          .eq("id", v.cost_center_id)
          .eq("company_id", v.company_id)
          .or(
            `business_unit_id.is.null,business_unit_id.eq.${v.business_unit_id}`,
          )
          .single(),
      ]);
    if (!supplier)
      return {
        success: false,
        message: "El proveedor no pertenece a la empresa seleccionada.",
        fieldErrors: { supplier_id: ["Selecciona un proveedor válido"] },
      };
    if (!category)
      return {
        success: false,
        message: "Selecciona una categoría válida para la empresa y unidad.",
      };
    if (!center)
      return {
        success: false,
        message:
          "Selecciona un centro de costo válido para la empresa y unidad.",
      };
    const payload = {
      company_id: v.company_id,
      business_unit_id: v.business_unit_id,
      request_type: v.request_type,
      supplier_id: v.supplier_id,
      supplier_rut: supplier.rut,
      supplier_legal_name: supplier.legal_name,
      amount: v.amount,
      currency: "CLP",
      expense_category_id: v.expense_category_id,
      cost_center_id: v.cost_center_id,
      priority: v.priority,
      requested_payment_date: v.requested_payment_date || null,
      description: v.description,
      notes: v.notes || null,
    };
    let id = v.id;
    if (id) {
      const { data: existing } = await supabase
        .from("payment_requests")
        .select("id,status,requester_id")
        .eq("id", id)
        .single();
      if (
        !existing ||
        existing.requester_id !== ctx.user.id ||
        !["draft", "correction_requested"].includes(existing.status)
      )
        return {
          success: false,
          message: "Esta solicitud ya no puede editarse.",
        };
      const { error } = await supabase
        .from("payment_requests")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("payment_requests")
        .insert({
          ...payload,
          requester_id: ctx.user.id,
          created_by: ctx.user.id,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }
    const files = form
      .getAll("attachments")
      .filter((x): x is File => x instanceof File && x.size > 0);
    if (files.length > MAX_ATTACHMENT_COUNT)
      return {
        success: false,
        id,
        message: `Puedes adjuntar un máximo de ${MAX_ATTACHMENT_COUNT} archivos por vez.`,
        fieldErrors: {
          attachments: [`Selecciona hasta ${MAX_ATTACHMENT_COUNT} archivos.`],
        },
      };
    for (const file of files) {
      const invalid = validateAttachment(file);
      if (invalid)
        return {
          success: false,
          id,
          message: invalid,
          fieldErrors: { attachments: [invalid] },
        };
      const path = `${v.company_id}/${id}/${crypto.randomUUID()}.${extension(file)}`;
      const upload = await supabase.storage
        .from("payment-request-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const meta = await supabase.from("payment_request_attachments").insert({
        company_id: v.company_id,
        payment_request_id: id,
        object_path: path,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: ctx.user.id,
      });
      if (meta.error) {
        await supabase.storage
          .from("payment-request-attachments")
          .remove([path]);
        throw meta.error;
      }
    }
    revalidatePath("/finance/payment-control/my-requests");
    revalidatePath(`/finance/payment-control/requests/${id}`);
    return { success: true, id, message: "Borrador guardado correctamente." };
  } catch (error) {
    return { success: false, message: safeError(error) };
  }
}

export async function previewWorkflowAction(
  requestId: string,
): Promise<ActionResult> {
  try {
    await context();
    const s = await createSupabaseServerClient();
    const { data, error } = await s.rpc("preview_payment_request_workflow", {
      payment_request_id: requestId,
    });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, message: safeError(error) };
  }
}
export async function submitPaymentRequestAction(
  requestId: string,
): Promise<ActionResult> {
  try {
    await context();
    const s = await createSupabaseServerClient();
    const { data, error } = await s.rpc("submit_payment_request", {
      payment_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath("/finance/payment-control/my-requests");
    revalidatePath(`/finance/payment-control/requests/${requestId}`);
    return { success: true, data, message: "Solicitud enviada a aprobación." };
  } catch (error) {
    return { success: false, message: safeError(error) };
  }
}
export async function deleteAttachmentAction(
  attachmentId: string,
): Promise<ActionResult> {
  try {
    await context();
    const s = await createSupabaseServerClient();
    const { data, error } = await s.rpc("delete_payment_request_attachment", {
      attachment_id: attachmentId,
    });
    if (error) throw error;
    const result = data as { bucket_id: string; object_path: string };
    const removed = await s.storage
      .from(result.bucket_id)
      .remove([result.object_path]);
    if (removed.error)
      throw new Error(`Storage pendiente: ${removed.error.message}`);
    revalidatePath("/finance/payment-control");
    return { success: true, message: "Respaldo eliminado." };
  } catch (error) {
    return { success: false, message: safeError(error) };
  }
}
export async function createSupplierAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await context();
    if (!ctx.permissions.has("finance.suppliers.manage"))
      return {
        success: false,
        message: "No tienes permiso para crear proveedores.",
      };
    const companyId = String(form.get("company_id") ?? "");
    const rut = String(form.get("rut") ?? "").trim();
    const legalName = String(form.get("legal_name") ?? "").trim();
    if (
      !ctx.companies.some((c) => c.id === companyId) ||
      !rut ||
      legalName.length < 2
    )
      return {
        success: false,
        message: "Completa empresa, RUT y razón social.",
      };
    const s = await createSupabaseServerClient();
    const { data, error } = await s
      .from("suppliers")
      .insert({
        company_id: companyId,
        rut,
        legal_name: legalName,
        created_by: ctx.user.id,
      })
      .select("id,rut,legal_name")
      .single();
    if (error) {
      if (error.code === "23505")
        return {
          success: false,
          message: "Ya existe un proveedor con ese RUT en la empresa.",
        };
      throw error;
    }
    return { success: true, data, message: "Proveedor creado." };
  } catch (error) {
    return { success: false, message: safeError(error) };
  }
}
