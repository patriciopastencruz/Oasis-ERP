"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { validateAttachment } from "./schemas";
export type PaymentResult = {
  success: boolean;
  message?: string;
  data?: unknown;
  fieldErrors?: Record<string, string[]>;
};
const methods = [
  "bank_transfer",
  "card",
  "check",
  "cash",
  "petty_cash",
  "other",
] as const;
const executeSchema = z.object({
  request_id: z.string().uuid(),
  company_id: z.string().uuid(),
  paid_at: z.string().min(1),
  method: z.enum(methods),
  operation_number: z.string().trim().max(120).optional(),
  amount: z.coerce.number().int().positive(),
  notes: z.string().trim().max(1000).optional(),
});
function friendly(m: string) {
  if (/aprobada/i.test(m))
    return "Solo las solicitudes aprobadas pueden registrarse como pagadas.";
  if (/monto/i.test(m))
    return "El monto debe coincidir exactamente con el aprobado.";
  if (/comprobante/i.test(m)) return "Debes adjuntar un comprobante válido.";
  if (/operación/i.test(m))
    return "Ingresa el número de operación o referencia.";
  if (/autorizado|permiso/i.test(m))
    return "No tienes permiso para realizar esta operación.";
  if (/ejecutado/i.test(m)) return "Este pago ya fue ejecutado.";
  return "No fue posible completar la operación. Actualiza e intenta nuevamente.";
}
export async function executePaymentAction(
  _p: PaymentResult,
  form: FormData,
): Promise<PaymentResult> {
  try {
    const ctx = await requirePermission("finance.payments.execute");
    const v = executeSchema.safeParse(Object.fromEntries(form));
    if (!v.success)
      return {
        success: false,
        message: "Revisa los datos de ejecución.",
        fieldErrors: v.error.flatten().fieldErrors,
      };
    const file = form.get("receipt");
    if (!(file instanceof File) || file.size === 0)
      return {
        success: false,
        message: "Debes adjuntar el comprobante de pago.",
      };
    const invalid = validateAttachment(file);
    if (invalid) return { success: false, message: invalid };
    const s = await createSupabaseServerClient();
    const prepared = await s.rpc("prepare_payment_registration", {
      target_request: v.data.request_id,
    });
    if (prepared.error) {
      console.error(
        "[prepare-payment]",
        prepared.error.code,
        prepared.error.message,
      );
      return { success: false, message: friendly(prepared.error.message) };
    }
    const paymentId = String(
      (prepared.data as { payment_id?: string } | null)?.payment_id ?? "",
    );
    const { data: payment } = await s
      .from("payments")
      .select("id,payment_request_id,paid_at,company_id")
      .eq("id", paymentId)
      .single();
    if (!payment || payment.company_id !== v.data.company_id)
      return { success: false, message: "Pago no disponible." };
    if (payment.paid_at) {
      return {
        success: true,
        message: "El pago ya estaba ejecutado.",
        data: { already_paid: true },
      };
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf",
      path = `${v.data.company_id}/${paymentId}/${crypto.randomUUID()}.${ext}`;
    const up = await s.storage
      .from("payment-receipts")
      .upload(path, file, { contentType: file.type });
    if (up.error) throw up.error;
    const meta = await s.from("payment_receipts").insert({
      company_id: v.data.company_id,
      payment_id: paymentId,
      object_path: path,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: ctx.user.id,
    });
    if (meta.error) {
      await s.storage.from("payment-receipts").remove([path]);
      throw meta.error;
    }
    const { data, error } = await s.rpc("execute_payment", {
      target_payment: paymentId,
      target_paid_at: new Date(v.data.paid_at).toISOString(),
      target_method: v.data.method,
      target_operation_number: v.data.operation_number || null,
      target_amount: v.data.amount,
      execute_notes: v.data.notes || null,
    });
    if (error) {
      console.error("[execute-payment]", error.code, error.message);
      return { success: false, message: friendly(error.message) };
    }
    refresh(payment.payment_request_id);
    return {
      success: true,
      message: "Pago ejecutado y comprobante registrado.",
      data,
    };
  } catch (e) {
    console.error("[execute-payment]", e);
    return { success: false, message: "No fue posible ejecutar el pago." };
  }
}
function refresh(id: string) {
  revalidatePath("/finance/payment-control/payments");
  revalidatePath("/finance/payment-control/payments/scheduled");
  revalidatePath("/finance/payment-control/payments/paid");
  revalidatePath(`/finance/payment-control/payments/${id}`);
  revalidatePath(`/finance/payment-control/requests/${id}`);
}
