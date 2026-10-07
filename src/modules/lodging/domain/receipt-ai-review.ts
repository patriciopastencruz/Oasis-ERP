export type ReceiptAiStatus =
  "pending" | "matched" | "mismatch" | "unreadable" | "error";

/** Diferencia máxima (CLP) aceptada entre el pago y el monto leído. */
export const RECEIPT_AMOUNT_TOLERANCE = 50;

export type ReceiptAiReview = {
  status: ReceiptAiStatus;
  detectedAmount: number | null;
  detectedDate: string | null;
  operationNumber: string | null;
  confidence: number | null;
  notes: string;
  model: string | null;
  reviewedAt: string | null;
};

export function classifyReceiptAmount(input: {
  expectedAmount: number;
  detectedAmount: number | null;
  confidence: number;
  legible: boolean;
}): ReceiptAiStatus {
  if (
    !input.legible ||
    input.detectedAmount === null ||
    input.confidence < 0.65
  )
    return "unreadable";
  return Math.abs(input.expectedAmount - input.detectedAmount) <=
    RECEIPT_AMOUNT_TOLERANCE
    ? "matched"
    : "mismatch";
}

export type ReceiptReviewRow = {
  id: string;
  deleted_at: string | null;
  ai_review_status: ReceiptAiStatus;
  ai_detected_amount: number | string | null;
  ai_confidence: number | string | null;
  ai_notes: string | null;
};

export type ReceiptPaymentRow = {
  amount: number | string;
  type: string;
  status: string;
  lodging_payment_receipts: ReceiptReviewRow[] | ReceiptReviewRow | null;
};

export type ReservationReceiptStatus = ReceiptAiStatus | "missing";

type PaymentReviewResult = {
  status: ReceiptAiStatus;
  paymentAmount: number;
  detectedAmount: number | null;
  receiptCount: number;
  ai_notes: string | null;
};

// Un pago puede respaldarse con varios comprobantes (por ejemplo, una parte
// con tarjeta y otra por transferencia). El monto se valida sumando los
// montos leídos de todos los comprobantes del pago, no uno por uno.
function reviewPayment(
  paymentAmount: number,
  receipts: ReceiptReviewRow[],
): PaymentReviewResult {
  const notes =
    receipts
      .map((receipt) => receipt.ai_notes?.trim())
      .filter(Boolean)
      .join(" | ") || null;
  const blocking = (["unreadable", "error", "pending"] as const).find(
    (candidate) =>
      receipts.some((receipt) => receipt.ai_review_status === candidate),
  );
  const amounts = receipts.map((receipt) =>
    receipt.ai_detected_amount === null
      ? null
      : Number(receipt.ai_detected_amount),
  );
  const complete = amounts.every((amount) => amount !== null);
  const detectedAmount = complete
    ? amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0)
    : null;
  const status: ReceiptAiStatus =
    blocking ??
    (detectedAmount === null
      ? "unreadable"
      : Math.abs(paymentAmount - detectedAmount) <= RECEIPT_AMOUNT_TOLERANCE
        ? "matched"
        : "mismatch");
  return {
    status,
    paymentAmount,
    detectedAmount: blocking ? null : detectedAmount,
    receiptCount: receipts.length,
    ai_notes: notes,
  };
}

export function summarizeReceiptReviews(payments: ReceiptPaymentRow[]) {
  const results = payments
    .filter((payment) => payment.status !== "voided")
    .map((payment) => {
      const nested = Array.isArray(payment.lodging_payment_receipts)
        ? payment.lodging_payment_receipts
        : payment.lodging_payment_receipts
          ? [payment.lodging_payment_receipts]
          : [];
      return reviewPayment(
        Number(payment.amount),
        nested.filter((receipt) => !receipt.deleted_at),
      );
    })
    .filter((result) => result.receiptCount > 0);

  if (!results.length)
    return {
      status: "missing" as const,
      receiptCount: 0,
      issue: null,
    };

  const priority: ReceiptAiStatus[] = [
    "mismatch",
    "unreadable",
    "error",
    "pending",
    "matched",
  ];
  const status = priority.find((candidate) =>
    results.some((result) => result.status === candidate),
  )!;
  const issue = results.find((result) => result.status === status) ?? null;

  return {
    status,
    receiptCount: results.reduce((sum, result) => sum + result.receiptCount, 0),
    issue,
  };
}
