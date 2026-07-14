import { describe, expect, it } from "vitest";
import {
  calculateOrderTotal,
  canTransition,
  iceKilograms,
  paymentState,
} from "./distribution";

describe("Distribuidora Altiplánica", () => {
  it("calcula pedidos de múltiples productos", () =>
    expect(
      calculateOrderTotal(
        [
          { quantity: 2, unitPrice: 1500 },
          { quantity: 3, unitPrice: 900 },
        ],
        200,
      ),
    ).toEqual({ subtotal: 5700, total: 5500 }));
  it("rechaza cantidades no positivas", () =>
    expect(() =>
      calculateOrderTotal([{ quantity: 0, unitPrice: 1000 }]),
    ).toThrow("inválida"));
  it("valida transiciones sin devolver entregas a borrador", () => {
    expect(canTransition("assigned", "en_route")).toBe(true);
    expect(canTransition("delivered", "draft")).toBe(false);
  });
  it("distingue pagos parciales y evita sobrepagos", () => {
    expect(paymentState(10000, 4000)).toBe("partial");
    expect(() => paymentState(10000, 11000)).toThrow("inválido");
  });
  it("calcula kilos desde el factor estructurado", () =>
    expect(
      iceKilograms([
        { quantity: 5, iceWeightKg: 2 },
        { quantity: 3, iceWeightKg: 1 },
      ]),
    ).toBe(13));
});
