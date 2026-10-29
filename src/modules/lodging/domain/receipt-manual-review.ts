import { z } from "zod";
import type { ReceiptAiStatus } from "./receipt-ai-review";

/** Resultado que deja quien revisa a mano los comprobantes de una reserva. */
export const REVIEW_OUTCOME_LABELS = {
  ok: "Correcto",
  corrected: "Corregido por administración",
  escalated: "Escalado a administración",
  pending_receipt: "Falta comprobante",
} as const;
export type ReviewOutcome = keyof typeof REVIEW_OUTCOME_LABELS;

/** Estados de la revisión automática que exigen que una persona mire el archivo. */
export const FLAGGED_AI_STATUSES: ReceiptAiStatus[] = ["mismatch", "unreadable", "error"];

/** Resultados que dejan algo abierto: la revisión se hizo, pero el caso sigue pendiente. */
const OPEN_OUTCOMES: ReviewOutcome[] = ["escalated", "pending_receipt"];

export const receiptReviewFormSchema = z.object({
  reservation_id: z.string().uuid(),
  outcome: z.enum(["ok", "corrected", "escalated", "pending_receipt"]),
  comment: z.string().trim().min(3, "Escribe un comentario de lo que revisaste.").max(500, "El comentario no puede superar 500 caracteres."),
});

export type ManualReview = {
  id: string;
  outcome: ReviewOutcome;
  comment: string;
  reviewed_at: string;
  reviewer: string | null;
};

type Relation<T> = T | T[] | null | undefined;
const first = <T>(v: Relation<T>) => (Array.isArray(v) ? v[0] : (v ?? undefined));

type RawReview = {
  id: string;
  outcome: string;
  comment: string;
  reviewed_at: string;
  reviewer?: Relation<{ first_name: string; last_name: string }>;
};

/** Revisiones de una reserva, de la más reciente a la más antigua. */
export function mapManualReviews(raw: unknown): ManualReview[] {
  return ((raw ?? []) as RawReview[])
    .filter((r) => r.outcome in REVIEW_OUTCOME_LABELS)
    .map((r) => {
      const who = first(r.reviewer);
      return {
        id: r.id,
        outcome: r.outcome as ReviewOutcome,
        comment: r.comment,
        reviewed_at: r.reviewed_at,
        reviewer: who ? `${who.first_name} ${who.last_name}`.trim() : null,
      };
    })
    .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
}

type ChangeRow = { updated_at?: string | null; lodging_payment_receipts?: Relation<ReceiptChange> | ReceiptChange[] };
type ReceiptChange = { created_at?: string | null; deleted_at?: string | null };

/**
 * Último momento en que cambió algo que se revisa: un pago o un comprobante subido o eliminado.
 * Una revisión hecha antes de ese momento ya no cubre lo que se ve hoy. No cuenta la lectura automática: la IA reintenta
 * los errores cada 30 minutos y eso anulaba revisiones ya hechas aunque el archivo y el pago siguieran igual.
 */
export function latestReceiptChange(payments: ChangeRow[]): string | null {
  let latest: string | null = null;
  const consider = (value?: string | null) => {
    if (value && (!latest || value > latest)) latest = value;
  };
  for (const payment of payments) {
    consider(payment.updated_at);
    const receipts = Array.isArray(payment.lodging_payment_receipts)
      ? payment.lodging_payment_receipts
      : payment.lodging_payment_receipts
        ? [payment.lodging_payment_receipts]
        : [];
    for (const receipt of receipts as ReceiptChange[]) {
      consider(receipt.created_at);
      consider(receipt.deleted_at);
    }
  }
  return latest;
}

export type ManualReviewState = {
  /** none: sin revisión · reviewed: revisada y sin cambios después · stale: cambió algo después de revisarla. */
  state: "none" | "reviewed" | "stale";
  latest: ManualReview | null;
  /** La revisión vigente dejó el caso abierto (escalado o falta comprobante). */
  open: boolean;
};

export function manualReviewState(reviews: ManualReview[], changedAt: string | null): ManualReviewState {
  const latest = reviews[0] ?? null;
  if (!latest) return { state: "none", latest: null, open: false };
  const current = !changedAt || latest.reviewed_at >= changedAt;
  return {
    state: current ? "reviewed" : "stale",
    latest,
    open: current && OPEN_OUTCOMES.includes(latest.outcome),
  };
}

/** Marcada por la revisión automática y sin una revisión manual vigente que la cubra. */
export function needsManualReview(aiStatus: string, review: ManualReviewState) {
  return FLAGGED_AI_STATUSES.includes(aiStatus as ReceiptAiStatus) && review.state !== "reviewed";
}

/** Rutas a las que el formulario puede volver después de guardar (nunca una dirección externa). */
export function safeReviewBackPath(value: unknown, fallback: string) {
  const path = typeof value === "string" ? value : "";
  return /^\/lodging\/(?:reports\/history|reservations\/[0-9a-f-]{36})(?:\?[A-Za-z0-9=&_%-]*)?$/.test(path) ? path : fallback;
}
