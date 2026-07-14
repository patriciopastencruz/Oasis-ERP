import { describe, expect, it } from "vitest";
import { availableBalance, chileWeek, formatWeek } from "./petty-cash";

describe("Caja Chica semanal", () => {
  it("calcula semana calendario lunes a domingo", () => {
    expect(chileWeek(new Date("2026-07-15T15:00:00Z"))).toEqual({
      start: "2026-07-13",
      end: "2026-07-19",
    });
  });
  it("calcula el saldo sin valores negativos", () => {
    expect(availableBalance(100000, 73700)).toBe(26300);
    expect(availableBalance(100000, 105000)).toBe(0);
  });
  it("formatea el rango en español", () => {
    expect(formatWeek("2026-07-13", "2026-07-19")).toContain("13 de julio");
  });
});
