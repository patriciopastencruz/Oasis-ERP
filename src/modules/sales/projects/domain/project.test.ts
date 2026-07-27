import { describe, expect, it } from "vitest";
import {
  calcExpenseTotals,
  calcProjectResults,
  canTransitionProjectStatus,
  formatMargin,
} from "./project";

describe("project status transitions", () => {
  it("permite iniciar fabricacion desde pendiente", () =>
    expect(canTransitionProjectStatus("pending", "manufacturing")).toBe(
      true,
    ));
  it("permite finalizar directo desde fabricacion sin instalacion", () =>
    expect(canTransitionProjectStatus("manufacturing", "done")).toBe(true));
  it("permite pasar de fabricacion a instalacion", () =>
    expect(canTransitionProjectStatus("manufacturing", "installation")).toBe(
      true,
    ));
  it("impide volver de instalacion a fabricacion", () =>
    expect(canTransitionProjectStatus("installation", "manufacturing")).toBe(
      false,
    ));
  it("impide transicionar un proyecto finalizado", () =>
    expect(canTransitionProjectStatus("done", "manufacturing")).toBe(false));
  it("impide transicionar un proyecto cancelado", () =>
    expect(canTransitionProjectStatus("cancelled", "manufacturing")).toBe(
      false,
    ));
});

describe("calcExpenseTotals", () => {
  it("calcula IVA 19% sobre un gasto afecto", () => {
    expect(calcExpenseTotals(100000, false)).toEqual({
      iva: 19000,
      total: 119000,
    });
  });
  it("no calcula IVA sobre un gasto exento", () => {
    expect(calcExpenseTotals(50000, true)).toEqual({ iva: 0, total: 50000 });
  });
  it("redondea el IVA a 2 decimales", () => {
    const { iva, total } = calcExpenseTotals(333, false);
    expect(iva).toBeCloseTo(63.27, 2);
    expect(total).toBeCloseTo(396.27, 2);
  });
});

describe("calcProjectResults", () => {
  it("calcula resultado y margen sin mezclar IVA", () => {
    const results = calcProjectResults({
      netIncome: 30000000,
      netExpenses: 19000000,
      ivaOnIncome: 5700000,
      ivaOnExpenses: 3200000,
    });
    expect(results.result).toBe(11000000);
    expect(results.marginPercent).toBeCloseTo(36.6667, 3);
    expect(results.ivaOnIncome).toBe(5700000);
    expect(results.ivaOnExpenses).toBe(3200000);
  });
  it("devuelve margen no disponible cuando el ingreso neto es cero", () => {
    const results = calcProjectResults({
      netIncome: 0,
      netExpenses: 500000,
      ivaOnIncome: 0,
      ivaOnExpenses: 95000,
    });
    expect(results.marginPercent).toBeNull();
    expect(formatMargin(results.marginPercent)).toBe("No disponible");
  });
  it("permite un resultado negativo (perdida)", () => {
    const results = calcProjectResults({
      netIncome: 1000000,
      netExpenses: 1500000,
      ivaOnIncome: 190000,
      ivaOnExpenses: 285000,
    });
    expect(results.result).toBe(-500000);
    expect(results.marginPercent).toBeCloseTo(-50, 5);
  });
});

describe("formatMargin", () => {
  it("formatea el margen con coma decimal chilena", () => {
    expect(formatMargin(36.666667)).toBe("36,67 %");
  });
});
