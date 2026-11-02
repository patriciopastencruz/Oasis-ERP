import { describe, expect, it } from "vitest";
import { paymentDay } from "./payment-day";

describe("paymentDay", () => {
  it("pagado al salir: cuenta en la última noche (Emmanuel, 1 al 2 de noviembre)", () => {
    expect(paymentDay("2026-11-02T15:47:00-03:00", "2026-11-01", "2026-11-02")).toBe("2026-11-01");
    expect(paymentDay("2026-11-05T10:00:00-03:00", "2026-11-01", "2026-11-03")).toBe("2026-11-02");
  });

  it("abono antes de llegar: cuenta el día de ingreso", () => {
    expect(paymentDay("2026-10-28T09:00:00-03:00", "2026-11-01", "2026-11-03")).toBe("2026-11-01");
  });

  it("durante la estadía: cuenta el día en que paga", () => {
    expect(paymentDay("2026-11-01T20:00:00-03:00", "2026-11-01", "2026-11-03")).toBe("2026-11-01");
    expect(paymentDay("2026-11-02T09:00:00-03:00", "2026-11-01", "2026-11-04")).toBe("2026-11-02");
  });

  it("usa la hora de Chile y, sin estadía, el día del pago", () => {
    expect(paymentDay("2026-11-02T01:30:00Z", "2026-11-01", "2026-11-03")).toBe("2026-11-01");
    expect(paymentDay("2026-11-02T15:00:00-03:00", null, null)).toBe("2026-11-02");
  });
});
