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

  it("suma los comprobantes de un mismo pago antes de compararlo", () => {
    const receipt = (id: string, amount: number) => ({
      id,
      deleted_at: null,
      ai_review_status: "mismatch" as const,
      ai_detected_amount: amount,
      ai_confidence: 0.95,
      ai_notes: null,
    });
    const split = (total: number): ReceiptPaymentRow[] => [
      {
        amount: total,
        type: "total",
        status: "confirmed",
        lodging_payment_receipts: [receipt("a", 50_793), receipt("b", 50_000)],
      },
    ];
    expect(summarizeReceiptReviews(split(100_793))).toMatchObject({
      status: "matched",
      receiptCount: 2,
      issue: { paymentAmount: 100_793, detectedAmount: 100_793, receiptCount: 2 },
    });
    expect(summarizeReceiptReviews(split(100_791))).toMatchObject({
      status: "mismatch",
      issue: { paymentAmount: 100_791, detectedAmount: 100_793 },
    });
  });

  it("no da por válida la suma si algún comprobante sigue pendiente o es ilegible", () => {
    const payments: ReceiptPaymentRow[] = [
      {
        amount: 100_000,
        type: "total",
        status: "confirmed",
        lodging_payment_receipts: [
          {
            id: "a",
            deleted_at: null,
            ai_review_status: "matched",
            ai_detected_amount: 100_000,
            ai_confidence: 0.9,
            ai_notes: null,
          },
          {
            id: "b",
            deleted_at: null,
            ai_review_status: "pending",
            ai_detected_amount: null,
            ai_confidence: null,
            ai_notes: null,
          },
        ],
      },
    ];
    expect(summarizeReceiptReviews(payments).status).toBe("pending");
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
        ],
      },
      {
        amount: 50_000,
        type: "partial",
        status: "confirmed",
        lodging_payment_receipts: [
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
