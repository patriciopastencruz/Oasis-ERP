import { describe, expect, it } from "vitest";
import { lastMonthKeys } from "./months";

describe("meses del resumen ejecutivo", () => {
  it("lista los últimos meses con el más antiguo primero", () => {
    expect(lastMonthKeys("2026-11-26", 3)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("cruza el cambio de año", () => {
    expect(lastMonthKeys("2027-02-10", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});
