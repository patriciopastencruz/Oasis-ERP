import { describe, expect, it } from "vitest";
import { hourLabel, summarizeReservationHover } from "./reservation-hover";

const pay = (amount: number, receipts = 1, extra: object = {}) => ({
  status: "confirmed",
  amount,
  type: "total",
  lodging_payment_receipts: Array.from({ length: receipts }, (_, i) => ({ id: `r${i}`, deleted_at: null })),
  ...extra,
});

describe("recuadro de la reserva en el calendario", () => {
  it("pago completo con comprobante: todo ok", () => {
    const s = summarizeReservationHover({ total_value: 50000, lodging_reservation_payments: [pay(50000)] });
    expect(s).toMatchObject({ payment: "paid", receipt: "ok", paid: 50000, balance: 0 });
  });

  it("pago parcial muestra lo que falta", () => {
    const s = summarizeReservationHover({ total_value: 50000, lodging_reservation_payments: [pay(20000)] });
    expect(s).toMatchObject({ payment: "partial", balance: 30000 });
  });

  it("sin pagos: sin pago y sin comprobante que revisar", () => {
    const s = summarizeReservationHover({ total_value: 50000, lodging_reservation_payments: [] });
    expect(s).toMatchObject({ payment: "unpaid", receipt: "none" });
  });

  it("pago sin comprobante vigente o con el comprobante eliminado falta el comprobante", () => {
    expect(summarizeReservationHover({ total_value: 10000, lodging_reservation_payments: [pay(10000, 0)] }).receipt).toBe("missing");
    const deleted = pay(10000, 0, { lodging_payment_receipts: [{ id: "x", deleted_at: "2026-10-01" }] });
    expect(summarizeReservationHover({ total_value: 10000, lodging_reservation_payments: [deleted] }).receipt).toBe("missing");
  });

  it("comprobante parcial cuando solo algunos pagos lo tienen", () => {
    const s = summarizeReservationHover({
      total_value: 30000,
      lodging_reservation_payments: [pay(10000), pay(20000, 0)],
    });
    expect(s).toMatchObject({ payment: "paid", receipt: "partial", withReceipt: 1, payments: 2 });
  });

  it("los pagos anulados no cuentan y los reembolsos restan", () => {
    const s = summarizeReservationHover({
      total_value: 40000,
      lodging_reservation_payments: [pay(40000), pay(10000, 1, { type: "refund" }), pay(99999, 1, { status: "voided" })],
    });
    expect(s.paid).toBe(30000);
    expect(s.payment).toBe("partial");
  });

  it("empresa con pago posterior y reservas sin precio", () => {
    expect(summarizeReservationHover({ total_value: 80000, postpaid_company: true }).payment).toBe("postpaid");
    expect(summarizeReservationHover({ total_value: 0 }).payment).toBe("no_price");
  });

  it("formatea la hora de llegada y salida", () => {
    expect(hourLabel("17:19:00")).toBe("17:19");
    expect(hourLabel("2026-10-14T20:30:00Z")).toBe("17:30");
    expect(hourLabel(null)).toBeNull();
  });
});
