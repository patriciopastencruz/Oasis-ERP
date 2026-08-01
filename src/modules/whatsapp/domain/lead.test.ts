import { describe, expect, it } from "vitest";
import { missingQualificationFields } from "./lead";

describe("missingQualificationFields", () => {
  it("devuelve todos los campos cuando el lead está vacío", () => {
    expect(missingQualificationFields({})).toEqual([
      "full_name",
      "city",
      "product_interest",
      "bedrooms",
      "bathrooms",
      "surface_m2",
      "budget_clp",
    ]);
  });
  it("excluye los campos ya completados, preservando el orden", () => {
    expect(
      missingQualificationFields({
        full_name: "Juan Pérez",
        city: "Calama",
      }),
    ).toEqual([
      "product_interest",
      "bedrooms",
      "bathrooms",
      "surface_m2",
      "budget_clp",
    ]);
  });
  it("devuelve un arreglo vacío cuando todo está calificado", () => {
    expect(
      missingQualificationFields({
        full_name: "Juan Pérez",
        city: "Calama",
        product_interest: "casa",
        bedrooms: 3,
        bathrooms: 2,
        surface_m2: 60,
        budget_clp: 30000000,
      }),
    ).toEqual([]);
  });
});
