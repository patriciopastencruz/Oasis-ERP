import { describe, expect, it } from "vitest";
import { focusOnChosenHostel } from "./chosen-hostel";

const summary = [
  "*Hostal Atacama Oasis (Uruguay, sector 23 de marzo)* 🏨\n• Habitación: 1 cama matrimonial, baño compartido y cocina compartida: $29.000 por noche",
  "*Hospedaje Oasis Modulares (Centro de Calama)* 🏨\n• Modulares: modular matrimonial con baño privado y frigobar: $33.000 por noche",
  "*Hospedaje Oasis Cobija (Cobija, parcela número 10, cercano a Pedro de Valdivia)* 🏨\n• Mini depto: 1 cama matrimonial + futón, TV, cocina, frigobar y baño privado: $33.000 por noche",
].join("\n\n");

describe("focusOnChosenHostel", () => {
  it("muestra solo la hostal que el cliente ya eligió", () => {
    const focused = focusOnChosenHostel(summary, ["Tiene fotos?", "Ya perfecto, me quedo con el mini depto", "El jueves 29", "Dos personas"]);
    expect(focused).toMatch(/^\*Hospedaje Oasis Cobija/);
    expect(focused).not.toMatch(/Modulares|Atacama/);
  });

  it("vale la elección más reciente", () => {
    expect(focusOnChosenHostel(summary, ["mini depto", "mejor en el centro"])).toMatch(/^\*Hospedaje Oasis Modulares/);
    expect(focusOnChosenHostel(summary, ["me gustan los modulares"])).toMatch(/^\*Hospedaje Oasis Modulares/);
  });

  it("sin elección clara muestra todas", () => {
    expect(focusOnChosenHostel(summary, ["Hola, tiene habitación para 2?"])).toBeNull();
    expect(focusOnChosenHostel(summary, ["el mini depto o el de atacama"])).toBeNull();
    expect(focusOnChosenHostel(summary.split("\n\n")[2], ["mini depto"])).toBeNull();
  });
});
