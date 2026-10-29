import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readPaymentReceipt, receiptReaderModel } from "@/lib/ai/receipt-reader";
import {
  classifyReceiptAmount,
  type ReceiptAiReview,
} from "../domain/receipt-ai-review";

export async function analyzePaymentReceipt(input: {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  expectedAmount: number;
}): Promise<ReceiptAiReview> {
  const model = receiptReaderModel();
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      status: "error",
      detectedAmount: null,
      detectedDate: null,
      detectedTime: null,
      operationNumber: null,
      confidence: null,
      notes: "El servicio de revisión automática no está configurado.",
      model: null,
      reviewedAt: new Date().toISOString(),
    };
  }
  try {
    const parsed = await readPaymentReceipt({
      bytes: input.bytes,
      mimeType: input.mimeType,
    });
    return {
      status: classifyReceiptAmount({
        expectedAmount: input.expectedAmount,
        detectedAmount: parsed.amount,
        confidence: parsed.confidence,
        legible: parsed.legible,
      }),
      detectedAmount: parsed.amount,
      detectedDate: parsed.date,
      detectedTime: parsed.time ?? "",
      operationNumber: parsed.operationNumber,
      confidence: parsed.confidence,
      notes: parsed.notes,
      model,
      reviewedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      "[lodging-receipt-ai] No fue posible revisar el comprobante",
      {
        message: error instanceof Error ? error.message : "Error desconocido",
      },
    );
    return {
      status: "error",
      detectedAmount: null,
      detectedDate: null,
      detectedTime: null,
      operationNumber: null,
      confidence: null,
      notes: "No fue posible completar la revisión automática.",
      model,
      reviewedAt: new Date().toISOString(),
    };
  }
}

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
// Un "pending" con ai_reviewed_at reciente es una revisión en curso (la
// reclamó otro barrido); pasado este plazo se asume cortada y se reintenta.
const CLAIM_STALE_MS = 10 * 60_000;
// Un "error" (proveedor caído, clave faltante) se reintenta con calma para
// no repetirlo en cada carga del informe.
const ERROR_RETRY_MS = 30 * 60_000;

/**
 * Revisa con IA los comprobantes que quedaron sin resultado: los subidos
 * antes de existir la función, los que se cortaron a mitad de camino y los
 * que fallaron. Así el informe ya muestra el resultado cuando se abre.
 */
export async function reviewPendingPaymentReceipts(input: {
  receiptIds?: string[];
  businessUnitId?: string;
  limit?: number;
  concurrency?: number;
}) {
  const db = createSupabaseAdminClient();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const now = Date.now();
  const staleCut = new Date(now - CLAIM_STALE_MS).toISOString();
  const errorCut = new Date(now - ERROR_RETRY_MS).toISOString();
  let query = db
    .from("lodging_payment_receipts")
    .select(
      "id,private_path,mime_type,ai_review_status,ai_reviewed_at,lodging_reservation_payments!inner(amount,status)",
    )
    .is("deleted_at", null)
    .neq("lodging_reservation_payments.status", "voided")
    .or(
      `and(ai_review_status.eq.pending,ai_reviewed_at.is.null),and(ai_review_status.eq.pending,ai_reviewed_at.lt.${staleCut}),and(ai_review_status.eq.error,ai_reviewed_at.lt.${errorCut})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (input.receiptIds) {
    if (!input.receiptIds.length) return { reviewed: 0 };
    query = query.in("id", input.receiptIds);
  }
  if (input.businessUnitId)
    query = query.eq("business_unit_id", input.businessUnitId);
  const { data, error } = await query;
  if (error) {
    console.error("[lodging-receipt-ai] No fue posible listar pendientes", {
      code: error.code,
    });
    return { reviewed: 0 };
  }

  const queue = [...(data ?? [])];
  let reviewed = 0;
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const payment = Array.isArray(row.lodging_reservation_payments)
        ? row.lodging_reservation_payments[0]
        : row.lodging_reservation_payments;
      if (!payment || !ALLOWED_MIMES.has(row.mime_type)) continue;
      // Reclamo optimista: si otro barrido lo tomó antes, no se duplica la
      // llamada a la IA.
      let claim = db
        .from("lodging_payment_receipts")
        .update({ ai_reviewed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("ai_review_status", row.ai_review_status);
      claim = row.ai_reviewed_at
        ? claim.eq("ai_reviewed_at", row.ai_reviewed_at)
        : claim.is("ai_reviewed_at", null);
      const { data: claimed } = await claim.select("id").maybeSingle();
      if (!claimed) continue;
      const { data: file, error: downloadError } = await db.storage
        .from("lodging-payment-receipts")
        .download(row.private_path);
      if (downloadError || !file) {
        console.error("[lodging-receipt-ai] No fue posible leer el archivo", {
          receiptId: row.id,
        });
        continue;
      }
      await reviewAndSavePaymentReceipt({
        receiptId: row.id,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: row.mime_type as
          | "application/pdf"
          | "image/jpeg"
          | "image/png"
          | "image/webp",
        expectedAmount: Number(payment.amount),
      });
      reviewed++;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(input.concurrency ?? 4, queue.length) }, worker),
  );
  return { reviewed };
}

export async function reviewAndSavePaymentReceipt(input: {
  receiptId: string;
  bytes: Uint8Array;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  expectedAmount: number;
}) {
  const review = await analyzePaymentReceipt(input);
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("lodging_payment_receipts")
    .update({
      // Huella del archivo: sirve para detectar el mismo comprobante usado en dos pagos.
      file_sha256: createHash("sha256").update(input.bytes).digest("hex"),
      ai_review_status: review.status,
      ai_detected_amount: review.detectedAmount,
      ai_detected_date: review.detectedDate,
      ai_detected_time: review.detectedTime,
      ai_operation_number: review.operationNumber,
      ai_confidence: review.confidence,
      ai_notes: review.notes,
      ai_model: review.model,
      ai_reviewed_at: review.reviewedAt,
    })
    .eq("id", input.receiptId)
    .is("deleted_at", null);
  if (error) {
    console.error("[lodging-receipt-ai] No fue posible guardar la revisión", {
      receiptId: input.receiptId,
      code: error.code,
    });
    return;
  }
  // Si el comprobante repite un número de operación o un archivo ya usado en otro pago, se avisa a quienes lo revisan.
  const { error: duplicateError } = await db.rpc("lodging_notify_receipt_duplicate", { target_receipt: input.receiptId });
  if (duplicateError)
    console.error("[lodging-receipt-ai] No fue posible comprobar si el comprobante está repetido", {
      receiptId: input.receiptId,
      code: duplicateError.code,
    });
}

/**
 * Completa la hora de los comprobantes que ya se habían leído antes de guardar ese dato: sin tocar su estado ni su monto.
 * Es lo que permite comparar «mismo monto, fecha y hora» entre comprobantes de pagos distintos.
 */
export async function backfillReceiptTimes(input: { receiptIds?: string[]; businessUnitId?: string; limit?: number; concurrency?: number }) {
  const db = createSupabaseAdminClient();
  let query = db
    .from("lodging_payment_receipts")
    .select("id,private_path,mime_type")
    .is("deleted_at", null)
    .is("ai_detected_time", null)
    .not("ai_detected_date", "is", null)
    .not("ai_detected_amount", "is", null)
    .order("created_at", { ascending: false })
    .limit(400);
  if (input.receiptIds) {
    if (!input.receiptIds.length) return { filled: 0 };
    query = query.in("id", input.receiptIds);
  }
  if (input.businessUnitId) query = query.eq("business_unit_id", input.businessUnitId);
  const { data: candidates, error } = await query;
  // Varias aperturas seguidas del historial no deben leer los mismos comprobantes: cada una toma un subconjunto al azar.
  const data = (candidates ?? [])
    .map((row) => ({ row, order: Math.random() }))
    .sort((x, y) => x.order - y.order)
    .slice(0, Math.min(Math.max(input.limit ?? 30, 1), 100))
    .map(({ row }) => row);
  if (error) {
    console.error("[lodging-receipt-ai] No fue posible listar comprobantes sin hora", { code: error.code });
    return { filled: 0 };
  }
  const queue = [...data];
  let filled = 0;
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (!ALLOWED_MIMES.has(row.mime_type)) continue;
      const { data: file, error: downloadError } = await db.storage.from("lodging-payment-receipts").download(row.private_path);
      if (downloadError || !file) continue;
      try {
        const reading = await readPaymentReceipt({
          bytes: new Uint8Array(await file.arrayBuffer()),
          mimeType: row.mime_type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp",
        });
        const { error: updateError } = await db
          .from("lodging_payment_receipts")
          .update({ ai_detected_time: reading.time ?? "" })
          .eq("id", row.id)
          .is("ai_detected_time", null);
        if (!updateError) filled++;
      } catch (e) {
        console.error("[lodging-receipt-ai] No fue posible leer la hora del comprobante", { receiptId: row.id, message: e instanceof Error ? e.message : "desconocido" });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, queue.length) }, worker));
  return { filled };
}
