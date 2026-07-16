import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type {
  DistributionDailySummary,
  DistributionPeriodSummary,
} from "./queries";

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

export async function buildDailyClosurePdf({
  date,
  summary,
}: {
  date: string;
  summary: DistributionDailySummary;
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
  const drawProductTableHeader = () => {
    page.drawRectangle({
      x: 44,
      y: y - 8,
      width: 507,
      height: 22,
      color: primary,
    });
    for (const [label, x] of [
      ["Producto", 50],
      ["Presentacion", 210],
      ["Planificado", 330],
      ["Entregado", 410],
      ["Venta", 480],
    ] as const)
      page.drawText(label, { x, y, size: 8, font: bold, color: rgb(1, 1, 1) });
    y -= 24;
  };
  const nextPage = (redrawProductHeader: boolean) => {
    page = pdf.addPage(PAGE);
    y = 790;
    page.drawText("OASIS ERP - Cierre diario (cont.)", {
      x: 44,
      y,
      size: 11,
      font: bold,
      color: primary,
    });
    y -= 30;
    if (redrawProductHeader) drawProductTableHeader();
  };

  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: primary });
  page.drawText("OASIS ERP", {
    x: 44,
    y: 807,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("DISTRIBUIDORA ALTIPLANICA - CIERRE DIARIO", {
    x: 44,
    y: 782,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y = 724;
  draw(`Fecha: ${formatDate(date)}`, 44, 13, bold, primary);
  y -= 32;

  draw("INDICADORES DEL DIA", 44, 11, bold, primary);
  y -= 20;
  const rows: [string, string][] = [
    ["Pedidos del dia", String(summary.orders_total ?? 0)],
    ["Pedidos entregados", String(summary.delivered ?? 0)],
    ["Entregas parciales", String(summary.partial ?? 0)],
    ["Pendientes", String(summary.pending ?? 0)],
    ["No entregados", String(summary.not_delivered ?? 0)],
    ["Pedidos sin chofer", String(summary.unassigned ?? 0)],
    ["Ventas en ruta", String(summary.route_sales ?? 0)],
    ["Cumplimiento", `${summary.delivery_rate ?? 0}%`],
    ["Venta total del dia", money(summary.planned_sales ?? 0)],
    ["Venta total entregada", money(summary.delivered_sales ?? 0)],
    ["Efectivo recibido", money(summary.cash_received ?? 0)],
    ["Transferencia recibida", money(summary.transfer_received ?? 0)],
    ["Pago mixto recibido", money(summary.mixed_received ?? 0)],
    ["Monto vendido a credito", money(summary.credit ?? 0)],
    ["Total recibido", money(summary.total_received ?? 0)],
    ["Gastos del dia", money(summary.expense_total ?? 0)],
    ["Kilos de hielo", kg(summary.ice_kg ?? 0)],
    ["Unidades de agua", String(summary.water_units ?? 0)],
  ];
  for (const [label, value] of rows) {
    if (y - 16 < 60) nextPage(false);
    draw(label, 50, 9);
    draw(value, 320, 9, bold, primary);
    y -= 16;
  }

  y -= 16;
  if (y - 60 < 60) nextPage(false);
  draw("DETALLE POR PRODUCTO", 44, 11, bold, primary);
  y -= 20;
  drawProductTableHeader();
  const productRows = summary.product_details ?? [];
  for (const product of productRows) {
    if (y - 16 < 60) nextPage(true);
    draw(safeText(product.name).slice(0, 24), 50, 8);
    draw(safeText(product.presentation).slice(0, 18), 210, 8);
    draw(String(product.planned_quantity), 330, 8);
    draw(String(product.delivered_quantity), 410, 8, bold);
    draw(money(product.delivered_sales), 480, 8, bold, primary);
    y -= 16;
  }
  if (!productRows.length) {
    draw(
      "No hay productos asociados a pedidos de esta fecha.",
      50,
      9,
      regular,
      muted,
    );
    y -= 18;
  }
  y -= 6;
  draw("VENTA TOTAL ENTREGADA", 50, 10, bold, primary);
  draw(money(summary.delivered_sales ?? 0), 480, 10, bold, primary);

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
