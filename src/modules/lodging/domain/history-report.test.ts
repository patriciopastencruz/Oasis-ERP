import { describe, expect, it } from "vitest";
import {
  mapHistoryReservations,
  parseHistoryMonth,
  shiftMonth,
} from "./history-report";

const base = {
  nights: 2,
  nightly_rate: 50000,
  discount: 0,
  surcharge: 0,
  total_value: 100000,
  lodging_guests: [{ full_name: "Ana Pérez", phone: "+56911111111" }],
  lodging_rooms: { name: "Habitación 1" },
  lodging_reservation_payments: [
    {
      amount: 100000,
      type: "total",
      status: "confirmed",
      lodging_payment_receipts: [
        {
          id: "r1",
          deleted_at: null,
          ai_review_status: "matched",
          ai_detected_amount: 100000,
          ai_confidence: 0.9,
          ai_notes: "",
        },
      ],
    },
  ],
};

describe("historial de reservas", () => {
  it("combina auditoría de precio, huésped, habitación y revisión del comprobante", () => {
    const [row] = mapHistoryReservations([base]);
    expect(row.auditStatus).toBe("ok");
    expect(row.guest?.full_name).toBe("Ana Pérez");
    expect(row.room?.name).toBe("Habitación 1");
    expect(row.paid).toBe(100000);
    expect(row.receiptReview.status).toBe("matched");
  });

  it("marca diferencia cuando el total registrado no calza con noches × tarifa", () => {
    const [row] = mapHistoryReservations([{ ...base, total_value: 90000 }]);
    expect(row.auditStatus).toBe("mismatch");
    expect(row.difference).toBe(-10000);
  });

  it("valida el mes y desplaza meses", () => {
    expect(parseHistoryMonth("2026-10")).toBe("2026-10");
    expect(parseHistoryMonth("basura")).toMatch(/^\d{4}-\d{2}$/);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
