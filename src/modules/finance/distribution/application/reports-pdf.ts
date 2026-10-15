import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { drawDistributionClosingPages } from "./closing-executive-pdf";
import type {
  accumulatedMetrics,
  buildClosingProducts,
  cumulativeIncome,
  KgDay,
} from "../domain/closing-report";
import type {
  DistributionDailySummary,
  DistributionPeriodSummary,
} from "./queries";

/** Lo que suma el cierre completo: gastos declarados, productos agrupados, acumulado del mes y gráficos. */
export type DailyClosurePdfExtras = {
  monthLabel: string;
  closure: {
    status?: string | null;
    observations?: string | null;
    declared_expenses?: number | string | null;
    expense_detail?: string | null;
  } | null;
  closingProducts: ReturnType<typeof buildClosingProducts>;
  metrics: ReturnType<typeof accumulatedMetrics>;
  kgDays: KgDay[];
  incomeDays: ReturnType<typeof cumulativeIncome>;
};

const money = (value: number) =>
  `$ ${Math.round(value).toLocaleString("es-CL")}`;
const kg = (value: number) =>
  `${value.toLocaleString("es-CL", { maximumFractionDigits: 3 })} kg`;
const safeText = (value: unknown) =>
  String(value ?? "—").replace(/[^\x20-\xFF]/g, "-");
const formatDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
  });

const PAGE: [number, number] = [595, 842];

async function loadLogo(pdf: PDFDocument) {
  try {
    const bytes = await readFile(join(process.cwd(), "public", "business-units", "da.jpeg"));
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** Cierre diario ejecutivo de Distribuidora Altiplánica: dos hojas (el día y el acumulado del mes). */
export async function buildDailyClosurePdf({
  date,
  summary,
  extras,
}: {
  date: string;
  summary: DistributionDailySummary;
  extras: DailyClosurePdfExtras;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cierre diario Distribuidora Altiplanica ${date}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  drawDistributionClosingPages(pdf, { regular, bold }, await loadLogo(pdf), { date, summary, extras });
  return pdf.save();
}

export async function buildPeriodReportPdf({
  dateFrom,
  dateTo,
  summary,
}: {
  dateFrom: string;
  dateTo: string;
  summary: DistributionPeriodSummary;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = rgb(0.03, 0.2, 0.42);
  const muted = rgb(0.38, 0.45, 0.41);
  let page = pdf.addPage(PAGE);
  let y = 790;
  const draw = (
    value: string,
    x: number,
    size = 9,
    font = regular,
    color = rgb(0.08, 0.12, 0.1),
  ) => page.drawText(safeText(value), { x, y, size, font, color });
  const drawDailyTableHeader = () => {
    page.drawRectangle({
      x: 44,
      y: y - 8,
      width: 507,
      height: 22,
      color: primary,
    });
    page.drawText("Fecha", {
      x: 50,
      y,
      size: 8,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Ventas entregadas", {
      x: 200,
      y,
      size: 8,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y -= 24;
  };
  const nextPage = (redrawDailyHeader: boolean) => {
    page = pdf.addPage(PAGE);
    y = 790;
    page.drawText("OASIS ERP - Reporte por periodo (cont.)", {
      x: 44,
      y,
      size: 11,
      font: bold,
      color: primary,
    });
    y -= 30;
    if (redrawDailyHeader) drawDailyTableHeader();
  };

  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: primary });
  page.drawText("OASIS ERP", {
    x: 44,
    y: 807,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("DISTRIBUIDORA ALTIPLANICA - REPORTE POR PERIODO", {
    x: 44,
    y: 782,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y = 724;
  draw(`Periodo: ${formatDate(dateFrom)} al ${formatDate(dateTo)}`, 44, 13, bold, primary);
  y -= 32;

  draw("INDICADORES DEL PERIODO", 44, 11, bold, primary);
  y -= 20;
  const days = summary.days || 1;
  const rows: [string, string][] = [
    ["Dias del periodo", String(summary.days ?? 0)],
    ["Pedidos del periodo", String(summary.orders_total ?? 0)],
    ["Ventas totales del periodo", money(summary.delivered_sales ?? 0)],
    ["Venta planificada del periodo", money(summary.planned_sales ?? 0)],
    ["Kilos vendidos", kg(summary.total_kg ?? 0)],
    ["Cantidad de productos", String(summary.total_units ?? 0)],
    [
      "Creditos pendientes de cobro (saldo vigente)",
      money(summary.outstanding_credit ?? 0),
    ],
    ["Venta promedio de kilos por dia", kg((summary.total_kg ?? 0) / days)],
    [
      "Venta promedio total por dia",
      money((summary.delivered_sales ?? 0) / days),
    ],
  ];
  for (const [label, value] of rows) {
    if (y - 16 < 60) nextPage(false);
    draw(label, 50, 9);
    draw(value, 340, 9, bold, primary);
    y -= 16;
  }

  y -= 16;
  if (y - 60 < 60) nextPage(false);
  draw("VENTAS POR DIA", 44, 11, bold, primary);
  y -= 20;
  drawDailyTableHeader();
  const dailyRows = summary.daily ?? [];
  for (const day of dailyRows) {
    if (y - 16 < 60) nextPage(true);
    draw(formatDate(day.date), 50, 8);
    draw(money(day.sales), 200, 8, bold, day.sales > 0 ? primary : muted);
    y -= 16;
  }
  if (!dailyRows.length) {
    draw("Sin ventas registradas en este periodo.", 50, 9, regular, muted);
    y -= 18;
  }

  return pdf.save();
}
