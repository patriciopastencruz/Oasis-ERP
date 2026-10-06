import { describe, expect, it } from "vitest";
import { auditReservationPrice } from "./reservation-price-audit";

const base = {
  nights: 3,
  nightlyRate: 30_000,
  discount: 5_000,
  surcharge: 2_000,
  totalValue: 87_000,
  payments: [
    { amount: 40_000, type: "deposit", status: "confirmed" },
    { amount: 5_000, type: "refund", status: "confirmed" },
  ],
};

describe("auditoría de precios de reservas", () => {
  it("valida una tarifa cuyo total coincide", () => {
    expect(auditReservationPrice(base)).toEqual({
      status: "ok",
      expectedTotal: 87_000,
      registeredTotal: 87_000,
      difference: 0,
      paid: 35_000,
    });
  });

  it("detecta una diferencia entre el cálculo y el total registrado", () => {
    expect(
      auditReservationPrice({ ...base, totalValue: 80_000 }),
    ).toMatchObject({
      status: "mismatch",
      expectedTotal: 87_000,
      difference: -7_000,
    });
  });

  it("distingue precio ausente y total sin tarifa por noche", () => {
    expect(auditReservationPrice({ ...base, totalValue: 0 })).toMatchObject({
      status: "missing_price",
      expectedTotal: null,
    });
    expect(auditReservationPrice({ ...base, nightlyRate: 0 })).toMatchObject({
      status: "missing_rate",
      expectedTotal: null,
    });
  });
});
