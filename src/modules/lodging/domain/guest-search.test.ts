import { describe, expect, it } from "vitest";
import { phoneLikePattern, phoneMatches, searchAsPhone } from "./guest-search";

describe("búsqueda de huéspedes por teléfono", () => {
  it("reconoce un teléfono y no un nombre", () => {
    expect(searchAsPhone("+56 9 1234 5678")).toBe("56912345678");
    expect(searchAsPhone("912345678")).toBe("912345678");
    expect(searchAsPhone("María González")).toBeNull();
    expect(searchAsPhone("1234")).toBeNull();
  });
  it("coincide sin importar prefijo ni separadores", () => {
    expect(phoneMatches("+56 9 1234 5678", "912345678")).toBe(true);
    expect(phoneMatches("56912345678", "+56 (9) 1234-5678")).toBe(true);
    expect(phoneMatches("+56 9 1234 5679", "912345678")).toBe(false);
    expect(phoneMatches(null, "912345678")).toBe(false);
    expect(phoneMatches("1234", "912345678")).toBe(false);
  });
  it("arma un patrón que tolera separadores entre dígitos", () => {
    expect(phoneLikePattern("+56 9 1234 5678")).toBe("%1%2%3%4%5%6%7%8%");
  });
});
