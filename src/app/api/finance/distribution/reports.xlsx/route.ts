import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { closingReportData } from "@/modules/finance/distribution/application/queries";
export async function GET(request: NextRequest) {
  const date = z
    .string()
    .date()
    .parse(request.nextUrl.searchParams.get("date"));
  const d = await closingReportData(date);
  if (!d.ctx.permissions.has("finance.distribution.reports.export"))
    return new NextResponse("No autorizado", { status: 403 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resumen cierre");
  sheet.columns = [
    { header: "Indicador", key: "label", width: 34 },
    { header: "Valor", key: "value", width: 22 },
  ];
  for (const [label, key] of [
    ["Pedidos del día", "orders_total"],
    ["Pedidos entregados", "delivered"],
    ["Entregas parciales", "partial"],
    ["Pendientes", "pending"],
    ["No entregados", "not_delivered"],
    ["Pedidos sin chofer", "unassigned"],
    ["Ventas en ruta", "route_sales"],
    ["Cumplimiento (%)", "delivery_rate"],
    ["Venta total del día", "planned_sales"],
    ["Venta total entregada", "delivered_sales"],
    ["Efectivo recibido", "cash_received"],
    ["Transferencia recibida", "transfer_received"],
    ["Pago mixto recibido", "mixed_received"],
    ["Monto vendido a crédito", "credit"],
    ["Total recibido", "total_received"],
    ["Gastos del día", "expense_total"],
    ["Kilos de hielo", "ice_kg"],
    ["Unidades de agua", "water_units"],
  ] as const)
    sheet.addRow({ label, value: d.summary[key] ?? 0 });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF123525" },
  };
  const productSheet = workbook.addWorksheet("Detalle por producto");
  productSheet.columns = [
    { header: "Código", key: "code", width: 16 },
    { header: "Producto", key: "name", width: 34 },
    { header: "Presentación", key: "presentation", width: 22 },
    { header: "Cantidad planificada", key: "planned", width: 22 },
    { header: "Cantidad entregada", key: "delivered", width: 22 },
    { header: "Venta producto (CLP)", key: "sales", width: 24 },
  ];
  for (const product of d.summary.product_details ?? [])
    productSheet.addRow({
      code: product.code,
      name: product.name,
      presentation: product.presentation,
      planned: product.planned_quantity,
      delivered: product.delivered_quantity,
      sales: product.delivered_sales,
    });
  productSheet.addRow({
    name: "VENTA TOTAL ENTREGADA",
    sales: d.summary.delivered_sales ?? 0,
  });
  productSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  productSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF123525" },
  };
  productSheet.getColumn("sales").numFmt = '"$" #,##0';
  const lastRow = productSheet.lastRow;
  if (lastRow) lastRow.font = { bold: true };
  const headerStyle = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123525" } };
  };
  const declared = workbook.addWorksheet("Gastos y observaciones");
  declared.columns = [
    { header: "Concepto", key: "label", width: 34 },
    { header: "Valor", key: "value", width: 60 },
  ];
  declared.addRows([
    { label: "Estado del cierre", value: d.closure?.status === "closed" ? "Cerrado" : "Abierto" },
    { label: "Gastos declarados (CLP)", value: Number(d.closure?.declared_expenses ?? 0) },
    { label: "Detalle de gastos", value: d.closure?.expense_detail ?? "" },
    { label: "Observaciones", value: d.closure?.observations ?? "" },
  ]);
  headerStyle(declared.getRow(1));

  const grouped = workbook.addWorksheet("Cantidad por producto");
  grouped.columns = [
    { header: "Grupo", key: "group", width: 16 },
    { header: "Producto", key: "name", width: 28 },
    { header: "Vendido hoy", key: "units", width: 14 },
    { header: "Kilos hoy", key: "kg", width: 12 },
    { header: "Acumulado del mes", key: "month", width: 20 },
    { header: "Promedio por día", key: "avg", width: 18 },
  ];
  for (const group of d.closingProducts.groups)
    for (const row of group.items)
      grouped.addRow({
        group: group.label,
        name: row.name,
        units: row.units,
        kg: row.kind === "water" ? null : row.kg,
        month: row.monthUnits,
        avg: Math.round(row.monthAvgPerDay * 10) / 10,
      });
  headerStyle(grouped.getRow(1));

  const accumulated = workbook.addWorksheet("Acumulado del mes");
  accumulated.columns = [
    { header: "Fecha", key: "date", width: 14 },
    { header: "Kilos cubo", key: "cube", width: 14 },
    { header: "Kilos frappé", key: "frappe", width: 14 },
    { header: "Kilos totales", key: "total", width: 14 },
    { header: "Venta entregada (CLP)", key: "sales", width: 22 },
    { header: "Ingreso acumulado (CLP)", key: "cumulative", width: 24 },
  ];
  d.kgDays.forEach((day, index) =>
    accumulated.addRow({
      date: day.date,
      cube: day.cube,
      frappe: day.frappe,
      total: day.total,
      sales: d.incomeDays[index]?.daily ?? 0,
      cumulative: d.incomeDays[index]?.cumulative ?? 0,
    }),
  );
  accumulated.addRow({
    date: `Promedio kg/día (${d.metrics.days} días)`,
    total: Math.round(d.metrics.avgKgPerDay * 10) / 10,
    cumulative: d.metrics.income,
  });
  headerStyle(accumulated.getRow(1));
  accumulated.getColumn("sales").numFmt = '"$" #,##0';
  accumulated.getColumn("cumulative").numFmt = '"$" #,##0';
  const lastAccumulated = accumulated.lastRow;
  if (lastAccumulated) lastAccumulated.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cierre-distribuidora-${date}.xlsx"`,
    },
  });
}
