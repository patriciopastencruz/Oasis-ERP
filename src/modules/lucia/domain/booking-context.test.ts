import { describe, expect, it } from "vitest";
import { describeBookingState } from "./booking-context";

describe("describeBookingState", () => {
  it("antes de que recepción confirme, prohíbe pedir pagos", () => {
    const note = describeBookingState({ booking_status: "awaiting_reception", booking_total: null, booking_deposit: null, hold_expires_at: null });
    expect(note).toContain("no pidas pagos");
  });

  it("esperando pago, informa montos sin pedir repetir datos bancarios", () => {
    const note = describeBookingState({ booking_status: "awaiting_payment", booking_total: "64000", booking_deposit: 32000, hold_expires_at: "2026-10-21T18:30:00Z" });
    expect(note).toContain("$64.000");
    expect(note).toContain("$32.000");
    expect(note).toContain("no repitas los datos bancarios");
  });

  it("sin reserva en curso no agrega nada", () => {
    expect(describeBookingState({ booking_status: "none", booking_total: null, booking_deposit: null, hold_expires_at: null })).toBeNull();
  });
});
