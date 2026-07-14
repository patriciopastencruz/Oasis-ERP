import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dailyDistributionData } from "@/modules/finance/distribution/application/queries";
export async function GET(request: NextRequest) {
  const date = z
    .string()
    .date()
    .parse(request.nextUrl.searchParams.get("date"));
  const d = await dailyDistributionData(date);
  if (!d.ctx.permissions.has("finance.distribution.reports.export"))
    return new NextResponse("No autorizado", { status: 403 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cierre diario");
  sheet.columns = [
    { header: "Indicador", key: "label", width: 34 },
    { header: "Valor", key: "value", width: 22 },
  ];
  for (const [label, key] of [
    ["Pedidos", "orders_total"],
    ["Entregados", "delivered"],
    ["Pendientes", "pending"],
    ["No entregados", "not_delivered"],
    ["Venta planificada", "planned_sales"],
    ["Venta entregada", "delivered_sales"],
    ["Total cobrado", "collected"],
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
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cierre-distribuidora-${date}.xlsx"`,
    },
  });
}
