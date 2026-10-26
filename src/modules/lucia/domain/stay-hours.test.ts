import { describe, expect, it } from "vitest";
import { accessSentence, mentionsShortStay, nightlyChargeNote } from "./stay-hours";

describe("horarios de acceso y cobro por noche", () => {
  it("arma la frase de acceso cuando todas las hostales comparten horario", () => {
    const same = [
      { checkin_time: "14:00:00", checkout_time: "12:00:00" },
      { checkin_time: "14:00:00", checkout_time: "12:00:00" },
    ];
    expect(accessSentence(same)).toBe("el check-in es desde las 14:00 y el check-out hasta las 12:00 del día siguiente");
  });

  it("no inventa un horario si difieren o faltan", () => {
    expect(
      accessSentence([
        { checkin_time: "14:00:00", checkout_time: "12:00:00" },
        { checkin_time: "15:00:00", checkout_time: "12:00:00" },
      ]),
    ).toBeNull();
    expect(accessSentence([{ checkin_time: null, checkout_time: null }])).toBeNull();
    expect(accessSentence([])).toBeNull();
  });

  it("detecta cuando el cliente dice que se queda solo hasta cierta hora", () => {
    for (const text of [
      "Esque hasta las 12 nms nos quedamos",
      "nos quedamos hasta las doce",
      "solo por unas horas",
      "me quedo hasta el mediodía",
    ])
      expect(mentionsShortStay(text)).toBe(true);
    for (const text of ["Somos dos personas", "para hoy", "¿a qué hora es el check-out?"])
      expect(mentionsShortStay(text)).toBe(false);
  });

  it("aclara que se cobra la noche completa con un solo precio", () => {
    const note = nightlyChargeNote("el check-in es desde las 14:00 y el check-out hasta las 12:00 del día siguiente");
    expect(note).toContain("check-in es desde las 14:00");
    expect(note).toContain("noche completa");
    expect(note).toContain("precio es uno solo");
    expect(nightlyChargeNote(null)).toContain("noche completa");
  });
});
