import { describe, expect, it } from "vitest";
import { asksForLowerPrice, pricesWereQuoted } from "./lower-price";

describe("pedido de un precio menor", () => {
  it("detecta que pide algo más barato o de menor precio", () => {
    for (const text of [
      "¿Tiene algo más barato?",
      "tienen algo mas economico",
      "Hay algo de menor precio?",
      "hay otra opción más barata",
      "me hacen un descuento?",
      "tienes algo de 20 mil?",
      "algo por $15.000",
      "no tienen una tarifa más baja?",
      "No tiene algo de 20?",
      "En marketplace decía 20",
      "salía 25 en facebook",
    ])
      expect(asksForLowerPrice(text), text).toBe(true);
  });

  it("no se activa con consultas normales ni con fechas nuevas", () => {
    for (const text of [
      "Somos dos personas",
      "la opción 2 por favor",
      "del 25 al 27 de noviembre, tienes algo más barato?",
      "¿a qué hora es el check-in?",
      "quiero pagar por transferencia",
      "somos 20 personas",
      "llego a las 20:00",
      "para el 20 de noviembre",
      "por 15 noches",
      "tengo 25 años",
      "Muchas gracias de todas formas",
    ])
      expect(asksForLowerPrice(text), text).toBe(false);
  });

  it("solo aplica si ya se enviaron precios", () => {
    expect(pricesWereQuoted([{ role: "user", content: "hola" }, { role: "assistant", content: "Pieza 1: $25.000 por noche" }])).toBe(true);
    expect(pricesWereQuoted([{ role: "user", content: "algo de $10.000" }, { role: "assistant", content: "¿Para qué fechas?" }])).toBe(false);
  });
});
