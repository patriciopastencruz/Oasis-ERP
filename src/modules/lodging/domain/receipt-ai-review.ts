export type ReceiptAiStatus =
  "pending" | "matched" | "mismatch" | "unreadable" | "error";

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
  return Math.abs(input.expectedAmount - input.detectedAmount) <= 1
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

export function summarizeReceiptReviews(payments: ReceiptPaymentRow[]) {
  const receipts = payments
    .filter((payment) => payment.status !== "voided")
    .flatMap((payment) => {
      const nested = Array.isArray(payment.lodging_payment_receipts)
        ? payment.lodging_payment_receipts
        : payment.lodging_payment_receipts
          ? [payment.lodging_payment_receipts]
          : [];
      return nested
        .filter((receipt) => !receipt.deleted_at)
        .map((receipt) => ({
          ...receipt,
          paymentAmount: Number(payment.amount),
          detectedAmount:
            receipt.ai_detected_amount === null
              ? null
              : Number(receipt.ai_detected_amount),
        }));
    });

  if (!receipts.length)
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
    receipts.some((receipt) => receipt.ai_review_status === candidate),
  )!;
  const issue =
    receipts.find((receipt) => receipt.ai_review_status === status) ?? null;

  return { status, receiptCount: receipts.length, issue };
}
