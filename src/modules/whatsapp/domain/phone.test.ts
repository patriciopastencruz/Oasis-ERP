import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhoneNumber } from "./phone";

describe("normalizePhoneNumber", () => {
  it("acepta un E.164 ya válido", () => {
    expect(normalizePhoneNumber("+56912345678")).toBe("+56912345678");
  });
  it("quita el prefijo whatsapp: de Twilio", () => {
    expect(normalizePhoneNumber("whatsapp:+56912345678")).toBe(
      "+56912345678",
    );
  });
  it("quita espacios, guiones y paréntesis", () => {
    expect(normalizePhoneNumber("+56 9 1234-5678")).toBe("+56912345678");
  });
  it("antepone +56 a un celular chileno de 9 dígitos sin prefijo", () => {
    expect(normalizePhoneNumber("912345678")).toBe("+56912345678");
  });
  it("antepone + a un número con código de país pero sin +", () => {
    expect(normalizePhoneNumber("56912345678")).toBe("+56912345678");
  });
  it("rechaza texto basura", () => {
    expect(normalizePhoneNumber("hola")).toBeNull();
  });
  it("rechaza cadena vacía", () => {
    expect(normalizePhoneNumber("   ")).toBeNull();
  });
  it("rechaza un número demasiado corto", () => {
    expect(normalizePhoneNumber("+123")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("conserva el indicativo y los últimos 2 dígitos", () => {
    expect(maskPhone("+56912345678")).toBe("+56*******78");
  });
  it("no revienta con teléfonos muy cortos", () => {
    expect(maskPhone("+123")).toBe("***");
  });
});
