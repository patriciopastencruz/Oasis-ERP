import { describe, expect, it } from "vitest";
import {
  latestReceiptChange,
  manualReviewState,
  mapManualReviews,
  needsManualReview,
  receiptReviewFormSchema,
  safeReviewBackPath,
} from "./receipt-manual-review";

const review = (reviewed_at: string, outcome = "ok") => ({ id: reviewed_at, outcome, comment: "Comprobante correcto", reviewed_at, reviewer: { first_name: "Ana", last_name: "Rojas" } });

describe("revisión manual de comprobantes", () => {
  it("ordena las revisiones de la más reciente a la más antigua y nombra a quien revisó", () => {
    const list = mapManualReviews([review("2026-10-02T10:00:00Z"), review("2026-10-05T10:00:00Z", "escalated"), { id: "x", outcome: "raro", comment: "c", reviewed_at: "2026-10-09T00:00:00Z" }]);
    expect(list.map((r) => r.outcome)).toEqual(["escalated", "ok"]);
    expect(list[0].reviewer).toBe("Ana Rojas");
  });

  it("toma como último cambio el pago, el comprobante o su lectura automática", () => {
    expect(
      latestReceiptChange([
        { updated_at: "2026-10-01T10:00:00Z", lodging_payment_receipts: [{ created_at: "2026-10-01T10:05:00Z", ai_reviewed_at: "2026-10-01T10:06:00Z" }] },
        { updated_at: "2026-10-03T08:00:00Z", lodging_payment_receipts: { created_at: "2026-10-02T00:00:00Z", deleted_at: null } },
      ]),
    ).toBe("2026-10-03T08:00:00Z");
    expect(latestReceiptChange([])).toBeNull();
  });

  it("la revisión vale mientras no cambie nada después", () => {
    const reviews = mapManualReviews([review("2026-10-05T10:00:00Z")]);
    expect(manualReviewState(reviews, "2026-10-04T00:00:00Z").state).toBe("reviewed");
    expect(manualReviewState(reviews, null).state).toBe("reviewed");
    expect(manualReviewState(reviews, "2026-10-06T00:00:00Z").state).toBe("stale");
    expect(manualReviewState([], "2026-10-06T00:00:00Z").state).toBe("none");
  });

  it("un escalado o falta de comprobante deja el caso abierto", () => {
    const open = manualReviewState(mapManualReviews([review("2026-10-05T10:00:00Z", "escalated")]), null);
    expect(open).toMatchObject({ state: "reviewed", open: true });
    const stale = manualReviewState(mapManualReviews([review("2026-10-05T10:00:00Z", "escalated")]), "2026-10-07T00:00:00Z");
    expect(stale.open).toBe(false);
    expect(manualReviewState(mapManualReviews([review("2026-10-05T10:00:00Z")]), null).open).toBe(false);
  });

  it("solo exige revisión manual cuando la automática marcó el caso y nadie lo cubrió", () => {
    const none = manualReviewState([], null);
    const done = manualReviewState(mapManualReviews([review("2026-10-05T10:00:00Z")]), null);
    expect(needsManualReview("mismatch", none)).toBe(true);
    expect(needsManualReview("unreadable", none)).toBe(true);
    expect(needsManualReview("error", none)).toBe(true);
    expect(needsManualReview("mismatch", done)).toBe(false);
    expect(needsManualReview("matched", none)).toBe(false);
    expect(needsManualReview("missing", none)).toBe(false);
  });

  it("exige un comentario y un resultado válido", () => {
    const id = "6f1c3c2e-8a4b-4f56-9d0e-1a2b3c4d5e6f";
    expect(receiptReviewFormSchema.safeParse({ reservation_id: id, outcome: "ok", comment: "  " }).success).toBe(false);
    expect(receiptReviewFormSchema.safeParse({ reservation_id: id, outcome: "otro", comment: "Revisado" }).success).toBe(false);
    expect(receiptReviewFormSchema.parse({ reservation_id: id, outcome: "ok", comment: " Revisado " }).comment).toBe("Revisado");
  });

  it("solo vuelve a pantallas internas de reservas", () => {
    const id = "6f1c3c2e-8a4b-4f56-9d0e-1a2b3c4d5e6f";
    expect(safeReviewBackPath("/lodging/reports/history?month=2026-10&receipts=review", "/x")).toBe("/lodging/reports/history?month=2026-10&receipts=review");
    expect(safeReviewBackPath(`/lodging/reservations/${id}`, "/x")).toBe(`/lodging/reservations/${id}`);
    expect(safeReviewBackPath("https://malo.com", "/x")).toBe("/x");
    expect(safeReviewBackPath("//malo.com", "/x")).toBe("/x");
    expect(safeReviewBackPath("/lodging/reports/history?next=http://malo", "/x")).toBe("/x");
  });
});
