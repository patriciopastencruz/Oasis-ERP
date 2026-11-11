import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksForOtherHostels } from "./chosen-hostel";
import { asksForLowerPrice, quotedAmounts } from "./lower-price";
import { asksForPhotosAgain, photosAlreadySent } from "./no-repeat";

// Casos de conversaciones reales de noviembre (sin datos personales).
describe("experiencia de conversación", () => {
  const quoted = quotedAmounts([
    { role: "assistant", content: "• Simple matrimonial: $30.000 por noche\n• Mini depto: $38.000 por noche ($76.000 por 2 noches)" },
  ]);

  it("nombrar un precio ya cotizado es elegir, no pedir rebaja", () => {
    expect(asksForLowerPrice("Esa de 30", quoted)).toBe(false);
    expect(asksForLowerPrice("Consulta si ese precio de 38 es para 2 adultos y 2 niños", quoted)).toBe(false);
    expect(asksForLowerPrice("tienen algo de 20 mil?", quoted)).toBe(true);
    expect(asksForLowerPrice("algo más barato?", quoted)).toBe(true);
  });

  it("pedir otras hostales levanta el foco en la elegida", () => {
    expect(asksForOtherHostels("Me puedes dar más opciones en otras hostales que tengas")).toBe(true);
    expect(asksForOtherHostels("Muéstrame mas opciones")).toBe(true);
    expect(asksForOtherHostels("El mini departamento")).toBe(false);
  });

  it("las mismas fotos no se mandan dos veces, salvo que las pida otra vez", () => {
    const turns = [{ role: "assistant", content: "📸 Mini depto · Hospedaje Oasis Cobija" }];
    expect(photosAlreadySent(turns, "Mini depto")).toBe(true);
    expect(photosAlreadySent(turns, "Modulares")).toBe(false);
    expect(asksForPhotosAgain("me puedes mandar las fotos de nuevo?")).toBe(true);
    expect(asksForPhotosAgain("Este es el de 33?")).toBe(false);
  });

  it("el seguimiento respeta al cliente que lo está pensando y ofrece lo económico una vez", () => {
    const sql = readFileSync("supabase/migrations/20261111211228_lucia_followup_respects_waiting.sql", "utf8");
    expect(sql).toContain("analiz|lo convers");
    expect(sql).toContain("like '%algo más económico%'");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});
