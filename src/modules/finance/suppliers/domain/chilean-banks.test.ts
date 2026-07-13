import { describe, expect, it } from "vitest";
import { chileanBanks, isChileanBank } from "./chilean-banks";

describe("catálogo de bancos de Chile", () => {
  it("no contiene nombres duplicados", () => {
    expect(new Set(chileanBanks).size).toBe(chileanBanks.length);
  });

  it("incluye bancos de uso habitual", () => {
    expect(isChileanBank("BancoEstado")).toBe(true);
    expect(isChileanBank("Banco de Chile")).toBe(true);
    expect(isChileanBank("Banco Santander Chile")).toBe(true);
  });

  it("rechaza valores arbitrarios", () => {
    expect(isChileanBank("Banco inventado")).toBe(false);
  });
});
