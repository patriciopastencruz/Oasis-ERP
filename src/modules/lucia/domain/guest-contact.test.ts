import { describe, expect, it } from "vitest";
import { asksForWifi, displayPhone, wifiReply } from "./guest-contact";

describe("guest-contact", () => {
  it("detecta cuando pide el Wi-Fi", () => {
    expect(asksForWifi("hola la clave de wifi porfavor")).toBe(true);
    expect(asksForWifi("Cuál es la clave del Wi-Fi?")).toBe(true);
    expect(asksForWifi("¿tienen internet?")).toBe(true);
    expect(asksForWifi("Me manda la ubicación, gracias")).toBe(false);
  });

  it("entrega el número de recepción, o avisa al equipo si no hay", () => {
    expect(displayPhone("+56912345678")).toBe("+56 9 1234 5678");
    expect(wifiReply("Hospedaje Oasis Modulares", "+56912345678")).toContain(
      "Recepción de Hospedaje Oasis Modulares: +56 9 1234 5678",
    );
    expect(wifiReply("Hospedaje Oasis Modulares", null)).toContain("Ya les avisé");
  });
});
