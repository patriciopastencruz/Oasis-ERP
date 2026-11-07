import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthlyReconciliation } from "./monthly-reconciliation";
import type { MonthlySummary } from "@/modules/lodging/domain/monthly-closing";

const base = {
  lodging_income: { total: 70_000, by_method: { cash: 40_000, transfer: 30_000 } },
  sales: { total: 90_000, nights: 3, reservations: 2 },
  reconciliation: {
    mismatches: [
      { id: "b3", room: "Pieza 1", guest: "Ana", check_in: "2026-10-30", check_out: "2026-11-02", total_value: 90_000, paid: 40_000, difference: 50_000, postpaid_company: false },
    ],
    cancelled_payments: { count: 1, amount: 20_000 },
  },
} as unknown as MonthlySummary;

describe("conciliación del cierre mensual", () => {
  it("muestra venta, pagos, diferencia, reservas por revisar y pagos en anuladas", () => {
    const html = renderToStaticMarkup(<MonthlyReconciliation summary={base} />);
    expect(html).toContain("Venta de noches del mes");
    expect(html).toContain("Pagos contabilizados en el mes");
    expect(html).toContain("Efectivo");
    expect(html).toContain("Falta");
    expect(html).toContain("/lodging/reservations/b3");
    expect(html).toContain("reservas anuladas");
  });

  it("dice que coinciden cuando no hay diferencias", () => {
    const ok = {
      ...base,
      lodging_income: { total: 90_000, by_method: {} },
      reconciliation: { mismatches: [], cancelled_payments: { count: 0, amount: 0 } },
    } as MonthlySummary;
    const html = renderToStaticMarkup(<MonthlyReconciliation summary={ok} />);
    expect(html).toContain("Coinciden");
    expect(html).toContain("Todas las reservas del mes están pagadas");
    expect(html).not.toContain("reservas anuladas");
  });

  it("no aparece en cierres guardados antes de la venta por noches", () => {
    const old = { ...base, sales: undefined, reconciliation: undefined } as MonthlySummary;
    expect(renderToStaticMarkup(<MonthlyReconciliation summary={old} />)).toBe("");
  });
});
