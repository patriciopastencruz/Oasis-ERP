import { describe, expect, it } from "vitest";
import { isOverdue, monthlyVariation, safePercentage } from "./kpis";

describe("financial KPI rules", () => {
  it("avoids division by zero", () => expect(safePercentage(5, 0)).toBeNull());
  it("calculates monthly variation", () =>
    expect(monthlyVariation(120, 100)).toBe(20));
  it("returns null variation without previous base", () =>
    expect(monthlyVariation(120, 0)).toBeNull());
  it("identifies overdue unpaid payments", () =>
    expect(isOverdue("2026-07-10", "2026-07-11", false)).toBe(true));
  it("does not mark a paid item overdue", () =>
    expect(isOverdue("2026-07-10", "2026-07-11", true)).toBe(false));
});
