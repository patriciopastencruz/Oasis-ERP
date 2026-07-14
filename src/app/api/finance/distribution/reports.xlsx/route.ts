import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dailyDistributionData } from "@/modules/finance/distribution/application/queries";
export async function GET(request: NextRequest) {
  const date = z
    .string()
    .date()
    .parse(request.nextUrl.searchParams.get("date"));
  const d = await dailyDistributionData(
    date,
    "finance.distribution.reports.view",
  );
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
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cierre-distribuidora-${date}.xlsx"`,
    },
  });
}
