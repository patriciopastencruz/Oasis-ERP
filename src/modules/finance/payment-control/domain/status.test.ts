import { describe, expect, it } from "vitest";
import { canTransition } from "./status";

describe("payment request transitions", () => {
  it("permite enviar un borrador", () =>
    expect(canTransition("draft", "pending_approval")).toBe(true));
  it("impide pagar una solicitud rechazada", () =>
    expect(canTransition("rejected", "paid")).toBe(false));
  it("impide programar una solicitud no aprobada", () =>
    expect(canTransition("pending_approval", "scheduled")).toBe(false));
});
