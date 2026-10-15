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
  DistributionPeriodSummary,
} from "./queries";

describe("PDF del cierre diario ejecutivo", () => {
  it("es de dos hojas con gastos declarados, productos agrupados, promedios y gráficos", async () => {
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
    expect(document.getPageCount()).toBe(2);
  });

  it("sigue en dos hojas con el mes completo, sin ventas y sin cerrar", async () => {
    const daily = Array.from({ length: 31 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      kg_cube: index % 4 === 0 ? 0 : 400 + index * 9,
      kg_frappe: index % 5 === 0 ? 0 : 90 + index,
      sales: index % 4 === 0 ? 0 : 150000 + index * 2000,
    }));
    const accumulated = { month_start: "2026-10-01", days: 31, income: 4_800_000, kg_cube: 12000, kg_frappe: 3000, daily, by_product: [] };
    const bytes = await buildDailyClosurePdf({
      date: "2026-10-31",
      summary: {
        orders_total: 0, delivered: 0, partial: 0, pending: 0, not_delivered: 0, unassigned: 0, route_sales: 0, delivery_rate: 0,
        planned_sales: 0, delivered_sales: 0, cash: 0, transfer: 0, credit: 0, collected: 0, cash_received: 0, transfer_received: 0,
        mixed_received: 0, total_received: 0, expense_total: 0, ice_kg: 0, water_units: 0, product_details: [], driver_closures: [],
      },
      extras: {
        monthLabel: "octubre de 2026",
        closure: null,
        closingProducts: buildClosingProducts([], [], accumulated),
        metrics: accumulatedMetrics(accumulated),
        kgDays: kgPerDay(daily),
        incomeDays: cumulativeIncome(daily),
      },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
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
