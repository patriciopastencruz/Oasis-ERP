import { describe, expect, it } from "vitest";
import { choiceIsAmbiguous, listedOptions } from "./option-choice";

const modulares = [
  "¡Claro! Estas son las opciones de baño privado en Modulares:",
  "*Hospedaje Oasis Modulares* 🏨",
  "• Mini modular: mini modular con cama matrimonial y baño privado (12 m²): $28.000 por noche ($56.000 por 2 noches)",
  "• Modulares: modular 2 camas de 1 plaza con baño privado y frigobar: $32.000 por noche ($64.000 por 2 noches)",
  "• Modulares: modular matrimonial con baño privado y frigobar: $32.000 por noche ($64.000 por 2 noches)",
  "¿Cuál opción te acomoda?",
].join("\n");

describe("choiceIsAmbiguous", () => {
  it("lee las opciones listadas", () => {
    expect(listedOptions(modulares)).toHaveLength(3);
  });

  it("«la quiero» con varias opciones a la vista es ambiguo", () => {
    expect(choiceIsAmbiguous(modulares, "perfecto, la quiero. Soy Marta Rojas")).toBe(true);
    expect(choiceIsAmbiguous(modulares, "ok esa")).toBe(true);
    // «matrimonial» y «baño privado» aparecen en más de una opción.
    expect(choiceIsAmbiguous(modulares, "la matrimonial con baño privado")).toBe(true);
  });

  it("acepta cuando el cliente identifica una sola opción", () => {
    expect(choiceIsAmbiguous(modulares, "la mini modular por favor")).toBe(false);
    expect(choiceIsAmbiguous(modulares, "la de 2 camas de 1 plaza")).toBe(false);
    expect(choiceIsAmbiguous(modulares, "la de $28.000")).toBe(false);
    expect(choiceIsAmbiguous(modulares, "la primera")).toBe(false);
    expect(choiceIsAmbiguous(modulares, "la última, soy Marta")).toBe(false);
  });

  it("no interviene si Lucía mostró una sola opción o ninguna", () => {
    expect(choiceIsAmbiguous("¿Te reservo el modular matrimonial a $32.000 por noche?", "sí, la quiero")).toBe(false);
    expect(choiceIsAmbiguous("", "la quiero")).toBe(false);
  });

  it("el nombre de la hostal basta si esa hostal tiene una sola opción", () => {
    const twoHostels = [
      "*Hostal Atacama Oasis* 🏨",
      "• Habitación: 1 cama matrimonial, baño privado: $30.000 por noche",
      "*Hospedaje Oasis Cobija* 🏨",
      "• Simple matrimonial: TV y baño privado: $29.000 por noche",
    ].join("\n");
    expect(choiceIsAmbiguous(twoHostels, "la de Cobija")).toBe(false);
    expect(choiceIsAmbiguous(twoHostels, "la de baño privado")).toBe(true);
  });
});
