import { describe, expect, it } from "vitest";
import {
  classifyReceiptAmount,
  summarizeReceiptReviews,
  type ReceiptPaymentRow,
} from "./receipt-ai-review";

describe("revisión IA de comprobantes", () => {
  it("compara el monto leído con el pago sin dejar que la IA apruebe el pago", () => {
    expect(
      classifyReceiptAmount({
        expectedAmount: 50_000,
        detectedAmount: 50_000,
        confidence: 0.98,
        legible: true,
      }),
    ).toBe("matched");
    expect(
      classifyReceiptAmount({
        expectedAmount: 50_000,
        detectedAmount: 45_000,
        confidence: 0.98,
        legible: true,
      }),
    ).toBe("mismatch");
  });

  it("envía a revisión manual los montos poco confiables o ilegibles", () => {
    expect(
      classifyReceiptAmount({
        expectedAmount: 50_000,
        detectedAmount: 50_000,
        confidence: 0.5,
        legible: true,
      }),
    ).toBe("unreadable");
    expect(
      classifyReceiptAmount({
        expectedAmount: 50_000,
        detectedAmount: null,
        confidence: 0,
        legible: false,
      }),
    ).toBe("unreadable");
  });

  it("prioriza diferencias y omite comprobantes eliminados o pagos anulados", () => {
    const payments: ReceiptPaymentRow[] = [
      {
        amount: 50_000,
        type: "partial",
        status: "confirmed",
        lodging_payment_receipts: [
          {
            id: "matched",
            deleted_at: null,
            ai_review_status: "matched",
            ai_detected_amount: 50_000,
            ai_confidence: 0.98,
            ai_notes: null,
          },
          {
            id: "mismatch",
            deleted_at: null,
            ai_review_status: "mismatch",
            ai_detected_amount: 45_000,
            ai_confidence: 0.95,
            ai_notes: "Monto distinto.",
          },
        ],
      },
      {
        amount: 10_000,
        type: "partial",
        status: "voided",
        lodging_payment_receipts: {
          id: "ignored",
          deleted_at: null,
          ai_review_status: "error",
          ai_detected_amount: null,
          ai_confidence: null,
          ai_notes: null,
        },
      },
    ];

    expect(summarizeReceiptReviews(payments)).toMatchObject({
      status: "mismatch",
      receiptCount: 2,
      issue: {
        paymentAmount: 50_000,
        detectedAmount: 45_000,
      },
    });
  });

  it("informa cuando no existe comprobante vigente", () => {
    expect(summarizeReceiptReviews([])).toEqual({
      status: "missing",
      receiptCount: 0,
      issue: null,
    });
  });
});
