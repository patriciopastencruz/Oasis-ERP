import { describe, expect, it } from "vitest";
import { repeatsSummary, summaryAlreadySent } from "./no-repeat";

const summary = "*Hostal A* 🏨\n• Pieza 1: $28.000 por noche\n• Pieza 2: $24.000 por noche";

describe("no repetir el resumen de precios", () => {
  it("detecta si el resumen ya fue enviado por Lucía", () => {
    const turns = [{ role: "user", content: "hola" }, { role: "assistant", content: `Estas son las opciones\n\n${summary}\n\n¿Cuál?` }];
    expect(summaryAlreadySent(turns, summary)).toBe(true);
    expect(summaryAlreadySent(turns, "otro resumen")).toBe(false);
    expect(summaryAlreadySent(turns, null)).toBe(false);
    expect(summaryAlreadySent([{ role: "user", content: summary }], summary)).toBe(false);
  });

  it("detecta cuando la respuesta copia las líneas con precio", () => {
    expect(repeatsSummary(`Hola\n${summary}`, summary)).toBe(true);
    expect(repeatsSummary("¡De nada! Quedo atenta 😊", summary)).toBe(false);
    expect(repeatsSummary("La pieza 1: $28.000 por noche", "• Pieza 1: $28.000 por noche")).toBe(false);
  });
});
