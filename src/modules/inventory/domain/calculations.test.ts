import { describe, expect, it } from "vitest";
import {
  monthlyConsumption,
  purchaseAverage,
  resultingStock,
} from "./calculations";
describe("inventory calculations", () => {
  it("calcula promedio ponderado de todas las compras", () =>
    expect(purchaseAverage(20000, 10, 5, 3000)).toBe(2333.33));
  it("rebaja stock sin permitir negativos", () => {
    expect(resultingStock(10, 4)).toBe(6);
    expect(() => resultingStock(10, 12)).toThrow("Stock disponible: 10");
  });
  it("calcula consumo mensual", () =>
    expect(monthlyConsumption(12, 3)).toBe(4));
});
