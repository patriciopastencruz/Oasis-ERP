import { describe, expect, it } from "vitest";
import { lineTotals, nightsBetween, quotationFormSchema, quotationTotals, serviceBullets } from "./quotations";

describe("cotización de hospedaje", () => {
  it("reproduce el modelo: 1 habitación, $27.000 neto, 8 noches", () => {
    expect(lineTotals({ quantity: 1, unit_net: 27_000, nights: 8 })).toEqual({
      subtotal: 216_000,
      iva: 41_040,
      total: 257_040,
    });
  });
  it("suma varias líneas con IVA redondeado por línea", () => {
    const t = quotationTotals([
      { quantity: 2, unit_net: 10_000, nights: 3 },
      { quantity: 1, unit_net: 15_555, nights: 1 },
    ]);
    expect(t).toEqual({ net: 75_555, iva: 11_400 + 2_955, total: 75_555 + 11_400 + 2_955 });
  });
  it("calcula noches entre fechas", () => {
    expect(nightsBetween("2026-10-20", "2026-10-28")).toBe(8);
    expect(nightsBetween("2026-10-28", "2026-10-20")).toBeNull();
    expect(nightsBetween("", "2026-10-20")).toBeNull();
  });
  it("valida el formulario", () => {
    const ok = quotationFormSchema.safeParse({
      client_company: "Constructora Andes",
      lines: [{ description: "Baño privado", quantity: "1", unit_net: "27000", nights: "8" }],
    });
    expect(ok.success).toBe(true);
    expect(quotationFormSchema.safeParse({ client_company: "A", lines: [] }).success).toBe(false);
    expect(
      quotationFormSchema.safeParse({
        client_company: "Empresa",
        check_in: "2026-10-28",
        check_out: "2026-10-20",
        lines: [{ description: "x", quantity: 1, unit_net: 1, nights: 1 }],
      }).success,
    ).toBe(false);
  });
  it("separa el detalle del servicio en viñetas", () => {
    expect(serviceBullets("Hospedaje por noches; 1 persona; 1 habitación\nHabitaciones completamente amobladas.")).toEqual([
      "Hospedaje por noches; 1 persona; 1 habitación",
      "Habitaciones completamente amobladas.",
    ]);
  });
});
