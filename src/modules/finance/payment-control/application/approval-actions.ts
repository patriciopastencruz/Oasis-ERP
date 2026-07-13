"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { validateAttachment } from "./schemas";
export type DecisionResult = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
const schema = z.object({
  step_id: z.string().uuid(),
  request_id: z.string().uuid(),
  company_id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "request_correction"]),
  comment: z.string().trim().max(2000).optional(),
});
function friendly(message: string) {
  if (/comentario/i.test(message)) return "Esta etapa exige un comentario.";
  if (/respaldo/i.test(message))
    return "Esta etapa exige un respaldo adicional.";
  if (/ya fue resuelta/i.test(message))
    return "La etapa ya fue decidida por otro usuario.";
  if (/no autoriz/i.test(message))
    return "No estás autorizado o existe una etapa anterior pendiente.";
  return "No fue posible registrar la decisión. Actualiza la página e intenta nuevamente.";
}
export async function decideApprovalAction(
  _previous: DecisionResult,
  form: FormData,
): Promise<DecisionResult> {
  try {
    const ctx = await requirePermission("finance.approvals.decide");
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return {
        success: false,
        message: "Revisa la decisión y el comentario.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    const v = parsed.data;
    if (!ctx.companies.some((x) => x.id === v.company_id))
      return { success: false, message: "Empresa no autorizada." };
    const s = await createSupabaseServerClient();
    const files = form
      .getAll("attachments")
      .filter((x): x is File => x instanceof File && x.size > 0);
    for (const file of files) {
      const invalid = validateAttachment(file);
      if (invalid) return { success: false, message: invalid };
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${v.company_id}/${v.request_id}/${crypto.randomUUID()}.${ext}`;
      const upload = await s.storage
        .from("payment-request-attachments")
        .upload(path, file, { contentType: file.type });
      if (upload.error) throw upload.error;
      const meta = await s.from("payment_request_attachments").insert({
        company_id: v.company_id,
        payment_request_id: v.request_id,
        object_path: path,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: ctx.user.id,
      });
      if (meta.error) {
        await s.storage.from("payment-request-attachments").remove([path]);
        throw meta.error;
      }
    }
    const { error } = await s.rpc("decide_payment_request_approval_step", {
      target_step: v.step_id,
      decision: v.decision,
      decision_comment: v.comment || null,
      request_user_agent: "OASIS ERP Web",
    });
    if (error) {
      console.error("[approval-decision]", error.code, error.message);
      return { success: false, message: friendly(error.message) };
    }
    await s
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("recipient_id", ctx.user.id)
      .eq("entity_type", "payment_request")
      .eq("entity_id", v.request_id)
      .eq("status", "unread");
    revalidatePath("/finance/payment-control/approvals");
    revalidatePath(`/finance/payment-control/approvals/${v.request_id}`);
    revalidatePath(`/finance/payment-control/requests/${v.request_id}`);
    return {
      success: true,
      message:
        v.decision === "approve"
          ? "Solicitud aprobada en esta etapa."
          : v.decision === "reject"
            ? "Solicitud rechazada."
            : "Corrección solicitada.",
    };
  } catch (error) {
    console.error("[approval-action]", error);
    return {
      success: false,
      message: "Tu sesión expiró o no tienes permiso para decidir.",
    };
  }
}
export async function markNotificationReadAction(form: FormData) {
  const ctx = await requirePermission("finance.approvals.decide");
  const id = z.string().uuid().parse(form.get("id"));
  const s = await createSupabaseServerClient();
  await s
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", ctx.user.id);
  revalidatePath("/finance/payment-control/approvals");
}
