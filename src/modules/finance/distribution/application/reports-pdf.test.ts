import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDailyClosurePdf, buildPeriodReportPdf } from "./reports-pdf";
import {
  accumulatedMetrics,
  buildClosingProducts,
  cumulativeIncome,
  kgPerDay,
} from "../domain/closing-report";
import type {
  DistributionDailySummary,
  DistributionPeriodSummary,
} from "./queries";

describe("PDF del cierre diario", () => {
  it("genera un PDF paginado con los indicadores y el detalle por producto", async () => {
    const summary: DistributionDailySummary = {
      orders_total: 40,
      delivered: 32,
      partial: 2,
      pending: 4,
      not_delivered: 2,
      unassigned: 0,
      route_sales: 3,
      delivery_rate: 85,
      planned_sales: 1200000,
      delivered_sales: 1000000,
      cash: 400000,
      transfer: 300000,
      credit: 300000,
      collected: 700000,
      cash_received: 400000,
      transfer_received: 300000,
      mixed_received: 0,
      total_received: 700000,
      expense_total: 50000,
      ice_kg: 320,
      water_units: 90,
      product_details: Array.from({ length: 30 }, (_, index) => ({
        id: `p-${index}`,
        code: `ICE-${index}`,
        name: `Hielo cubo ${index} kg`,
        presentation: `Bolsa ${index} kg`,
        planned_quantity: 10 + index,
        delivered_quantity: 8 + index,
        delivered_sales: 8000 * (index + 1),
      })),
      driver_closures: [],
    };
    const bytes = await buildDailyClosurePdf({ date: "2026-07-15", summary });
    expect(Buffer.from(bytes).subarray(0, 4).toString("ascii")).toBe("%PDF");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});

describe("PDF del cierre diario con acumulado del mes", () => {
  it("incluye gastos declarados, productos agrupados, promedios y gráficos", async () => {
    const accumulated = {
      month_start: "2026-10-01",
      days: 15,
      income: 3_711_606,
      kg_cube: 8527,
      kg_frappe: 2430,
      daily: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-10-${String(index + 1).padStart(2, "0")}`,
        kg_cube: 500 + index,
        kg_frappe: 150 + index,
        sales: 240000 + index * 1000,
      })),
      by_product: [{ id: "c2", units: 3604 }],
    };
    const bytes = await buildDailyClosurePdf({
      date: "2026-10-15",
      summary: {
        orders_total: 1, delivered: 1, partial: 0, pending: 0, not_delivered: 0, unassigned: 0, route_sales: 0, delivery_rate: 100,
        planned_sales: 192040, delivered_sales: 192040, cash: 100000, transfer: 50000, credit: 42040, collected: 150000,
        cash_received: 100000, transfer_received: 50000, mixed_received: 0, total_received: 150000, expense_total: 0,
        ice_kg: 500, water_units: 10, product_details: [], driver_closures: [],
      },
      extras: {
        monthLabel: "octubre de 2026",
        closure: { status: "closed", declared_expenses: 35000, expense_detail: "Combustible", observations: "Sin novedades" },
        closingProducts: buildClosingProducts(
          [
            { id: "c2", code: "ICE-2KG", name: "Hielo cubo 2 kg", presentation: "Bolsa 2 kg", ice_weight_kg: 2 },
            { id: "w20", code: "WATER-20L", name: "Agua 20 litros", presentation: "Bidón 20 L", ice_weight_kg: 0 },
          ],
          [{ id: "c2", delivered_quantity: 190 }],
          accumulated,
        ),
        metrics: accumulatedMetrics(accumulated),
        kgDays: kgPerDay(accumulated.daily),
        incomeDays: cumulativeIncome(accumulated.daily),
      },
    });
    expect(Buffer.from(bytes).subarray(0, 4).toString("ascii")).toBe("%PDF");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe("PDF del reporte por período", () => {
  it("genera un PDF con los indicadores y la serie diaria de ventas", async () => {
    const summary: DistributionPeriodSummary = {
      days: 30,
      orders_total: 300,
      delivered_sales: 9000000,
      planned_sales: 9500000,
      total_kg: 4200,
      total_units: 3100,
      outstanding_credit: 650000,
      daily: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-07-${String(index + 1).padStart(2, "0")}`,
        sales: index % 3 === 0 ? 0 : 300000 + index * 1000,
      })),
    };
    const bytes = await buildPeriodReportPdf({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      summary,
    });
    expect(Buffer.from(bytes).subarray(0, 4).toString("ascii")).toBe("%PDF");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});
