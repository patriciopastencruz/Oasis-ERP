import { describe, expect, it } from "vitest";
import { paymentCountsAsIncome } from "./payment-income";

describe("pagos que cuentan como ingreso", () => {
  it("cuenta los pagos de reservas vigentes", () => {
    expect(paymentCountsAsIncome({ status: "confirmed" })).toBe(true);
    expect(paymentCountsAsIncome([{ status: "checked_out" }])).toBe(true);
  });

  it("no cuenta los pagos de reservas anuladas o en conflicto", () => {
    expect(paymentCountsAsIncome({ status: "cancelled" })).toBe(false);
    expect(paymentCountsAsIncome([{ status: "conflict" }])).toBe(false);
  });
});
