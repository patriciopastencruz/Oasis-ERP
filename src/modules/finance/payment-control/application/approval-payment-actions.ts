"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPaymentReceipt, type ReceiptReading } from "@/lib/ai/receipt-reader";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { dispatchApprovalEmails } from "@/lib/notifications/approval-email";
import { validateAttachment } from "./schemas";
import { decideApprovalAction, type DecisionResult } from "./approval-actions";
import {
  localInputToIso,
  operationNumberFor,
  paymentMethodFromReading,
  receiptAmountMatches,
  santiagoDateTimeToIso,
} from "../domain/receipt-payment";

/** Lo que el formulario debe pedir al usuario cuando el comprobante no alcanza. */
export type PayDecisionResult = DecisionResult & {
  needs?: {
    date?: boolean;
    amountMismatch?: { read: number; expected: number };
    amountUnknown?: boolean;
  };
};

const schema = z.object({
  step_id: z.string().uuid(),
  request_id: z.string().uuid(),
  company_id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "request_correction"]),
  comment: z.string().trim().max(2000).optional(),
  paid_at: z.string().optional(),
  confirm_amount: z.string().optional(),
});

function friendly(message: string) {
  if (/comentario/i.test(message)) return "Esta etapa exige un comentario.";
  if (/respaldo/i.test(message)) return "Esta etapa exige un respaldo adicional.";
  if (/ya fue resuelta/i.test(message)) return "La etapa ya fue decidida por otro usuario.";
  if (/no autoriz/i.test(message)) return "No estás autorizado o existe una etapa anterior pendiente.";
  return "No fue posible registrar la decisión. Actualiza la página e intenta nuevamente.";
}

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

/**
 * Última etapa de una solicitud de pago: aprobar y pagar en un solo paso. Se
 * adjunta el comprobante, la IA lee la fecha (y monto, operación y medio) y el
 * pago queda registrado; la solicitud termina como "pagada". Rechazar o pedir
 * corrección funcionan igual que siempre. Antes de tocar nada se valida el
 * comprobante: si no calza con lo aprobado, no se aprueba ni se paga.
 */
export async function decideAndPayAction(
  previous: PayDecisionResult,
  form: FormData,
): Promise<PayDecisionResult> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { success: false, message: "Revisa la decisión y el comentario." };
  const v = parsed.data;
  if (v.decision !== "approve") return decideApprovalAction(previous, form);

  try {
    const ctx = await requirePermission("finance.approvals.decide");
    if (!ctx.permissions.has("finance.payments.execute"))
      return decideApprovalAction(previous, form);
    if (!ctx.companies.some((x) => x.id === v.company_id))
      return { success: false, message: "Empresa no autorizada." };

    const s = await createSupabaseServerClient();
    const { data: request } = await s
      .from("payment_requests")
      .select("id,company_id,amount,status,use_supplier_bank_account,approval_instance_id")
      .eq("id", v.request_id)
      .single();
    if (!request || request.company_id !== v.company_id)
      return { success: false, message: "Solicitud no disponible." };

    // Solo si esta es la última etapa pendiente hay algo que pagar; si no, es
    // una aprobación normal y el pago se registra al final del flujo.
    const { data: steps } = await s
      .from("payment_request_approval_steps")
      .select("id,status")
      .eq("approval_instance_id", request.approval_instance_id);
    const pending = (steps ?? []).filter((x) => x.status === "pending");
    if (pending.length !== 1 || pending[0].id !== v.step_id)
      return decideApprovalAction(previous, form);

    const file = form.get("receipt");
    if (!(file instanceof File) || file.size === 0)
      return { success: false, message: "Adjunta el comprobante de pago para aprobar y pagar." };
    const invalid = validateAttachment(file);
    if (invalid) return { success: false, message: invalid };

    // 1) Leer el comprobante y validarlo ANTES de aprobar.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let reading: ReceiptReading | null = null;
    try {
      reading = await readPaymentReceipt({
        bytes,
        mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png",
      });
    } catch (error) {
      console.error("[approve-and-pay] No se pudo leer el comprobante", {
        message: error instanceof Error ? error.message : "Error",
      });
    }
    const expected = Number(request.amount);
    const read = reading?.legible && reading.confidence >= 0.65 ? reading.amount : null;
    const matches = receiptAmountMatches(read, expected);
    const confirmed = v.confirm_amount === "on";
    if (matches === false && !confirmed)
      return {
        success: false,
        message: `El comprobante muestra ${clp(read!)} y la solicitud aprobada es ${clp(expected)}. Si no corresponde, rechaza la solicitud; si el comprobante es correcto, confírmalo.`,
        needs: { amountMismatch: { read: read!, expected } },
      };
    if (matches === null && !confirmed)
      return {
        success: false,
        message: "No pude leer el monto del comprobante con certeza. Revísalo y confirma que corresponde al monto aprobado.",
        needs: { amountUnknown: true },
      };

    const paidAtIso =
      (v.paid_at ? localInputToIso(v.paid_at) : null) ??
      (reading?.date ? santiagoDateTimeToIso(reading.date, reading.time) : null);
    if (!paidAtIso)
      return {
        success: false,
        message: "No pude leer la fecha del pago en el comprobante. Indícala para continuar.",
        needs: { date: true },
      };

    const method = paymentMethodFromReading(reading?.method ?? null, Boolean(request.use_supplier_bank_account));
    const operation = operationNumberFor(method, reading?.operationNumber ?? null);

    // Respaldo adicional que algunas etapas exigen (mismo trato que una aprobación normal).
    const extras = form
      .getAll("attachments")
      .filter((x): x is File => x instanceof File && x.size > 0);
    for (const extra of extras) {
      const problem = validateAttachment(extra);
      if (problem) return { success: false, message: problem };
      const extraExt = extra.name.split(".").pop()?.toLowerCase() || "pdf";
      const extraPath = `${v.company_id}/${v.request_id}/${crypto.randomUUID()}.${extraExt}`;
      const extraUp = await s.storage
        .from("payment-request-attachments")
        .upload(extraPath, extra, { contentType: extra.type });
      if (extraUp.error) throw extraUp.error;
      const extraMeta = await s.from("payment_request_attachments").insert({
        company_id: v.company_id,
        payment_request_id: v.request_id,
        object_path: extraPath,
        original_name: extra.name,
        mime_type: extra.type,
        size_bytes: extra.size,
        uploaded_by: ctx.user.id,
      });
      if (extraMeta.error) {
        await s.storage.from("payment-request-attachments").remove([extraPath]);
        throw extraMeta.error;
      }
    }

    // 2) Aprobar la última etapa.
    const decided = await s.rpc("decide_payment_request_approval_step", {
      target_step: v.step_id,
      decision: "approve",
      decision_comment: v.comment || null,
      request_user_agent: "OASIS ERP Web",
    });
    if (decided.error) {
      console.error("[approve-and-pay] decisión", decided.error.code, decided.error.message);
      return { success: false, message: friendly(decided.error.message) };
    }
    revalidatePath("/finance/payment-control/approvals");
    revalidatePath(`/finance/payment-control/approvals/${v.request_id}`);
    revalidatePath(`/finance/payment-control/requests/${v.request_id}`);

    const afterPay = async (message: string, success: boolean): Promise<PayDecisionResult> => {
      await dispatchApprovalEmails();
      await s
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("recipient_id", ctx.user.id)
        .eq("entity_type", "payment_request")
        .eq("entity_id", v.request_id)
        .eq("status", "unread");
      revalidatePath("/finance/payment-control/payments");
      revalidatePath("/finance/payment-control/payments/paid");
      revalidatePath(`/finance/payment-control/payments/${v.request_id}`);
      return { success, message };
    };

    // 3) Registrar el pago con el comprobante adjunto.
    const failAfterApproval = (detail: string) =>
      afterPay(
        `La solicitud quedó aprobada, pero no se pudo registrar el pago (${detail}). Complétalo desde Pagos.`,
        false,
      );
    const { data: current } = await s.from("payment_requests").select("status").eq("id", v.request_id).single();
    if (current?.status !== "approved")
      return afterPay("Solicitud aprobada en esta etapa.", true);

    const prepared = await s.rpc("prepare_payment_registration", { target_request: v.request_id });
    if (prepared.error) {
      console.error("[approve-and-pay] prepare", prepared.error.message);
      return failAfterApproval("no se pudo preparar el pago");
    }
    const paymentId = String((prepared.data as { payment_id?: string } | null)?.payment_id ?? "");
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${v.company_id}/${paymentId}/${crypto.randomUUID()}.${ext}`;
    const up = await s.storage.from("payment-receipts").upload(path, bytes, { contentType: file.type });
    if (up.error) {
      console.error("[approve-and-pay] storage", up.error.message);
      return failAfterApproval("no se pudo guardar el comprobante");
    }
    const meta = await s.from("payment_receipts").insert({
      company_id: v.company_id,
      payment_id: paymentId,
      object_path: path,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: ctx.user.id,
    });
    if (meta.error) {
      await s.storage.from("payment-receipts").remove([path]);
      console.error("[approve-and-pay] receipt row", meta.error.message);
      return failAfterApproval("no se pudo registrar el comprobante");
    }
    const notes = [
      "Pago registrado al aprobar la solicitud, con datos leídos del comprobante.",
      operation.placeholder ? "El número de operación no era legible: ver el comprobante adjunto." : null,
      matches === true ? null : "El monto del comprobante fue confirmado manualmente por el aprobador.",
    ]
      .filter(Boolean)
      .join(" ");
    const executed = await s.rpc("execute_payment", {
      target_payment: paymentId,
      target_paid_at: paidAtIso,
      target_method: method,
      target_operation_number: operation.value,
      target_amount: expected,
      execute_notes: notes,
    });
    if (executed.error) {
      console.error("[approve-and-pay] execute", executed.error.message);
      return failAfterApproval("el sistema rechazó los datos del pago");
    }
    const paidOn = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date(paidAtIso));
    return afterPay(`Solicitud aprobada y pago registrado (${clp(expected)} · ${paidOn}).`, true);
  } catch (error) {
    console.error("[approve-and-pay]", error);
    return { success: false, message: "Tu sesión expiró o no tienes permiso para decidir." };
  }
}
