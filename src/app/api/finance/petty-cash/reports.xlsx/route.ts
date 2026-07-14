import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { pettyCashReport } from "@/modules/finance/petty-cash/application/report-query";

export async function GET(request: NextRequest) {
  const rows = await pettyCashReport(request.nextUrl.searchParams); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Caja Chica", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns: Array<[string, string, number]> = [
    ["Correlativo","correlativo",20],["Trabajador","trabajador",24],["Unidad","unidad",24],["Semana","semana",24],["Fecha gasto","fecha_gasto",14],["Comercio","comercio",24],["Tipo documento","tipo_documento",20],["N.º documento","numero_documento",16],["Categoría","categoria",22],["Centro de costo","centro_costo",22],["Descripción","descripcion",35],["Monto CLP","monto",15],["Estado","estado",18],["Administrador","administrador",24],["Fecha aprobación","fecha_aprobacion",20],["Observaciones","observaciones",30],["Comprobante","comprobante",30],
  ];
  sheet.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  rows.forEach((row) => sheet.addRow(row)); sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173F2D" } }; sheet.getColumn("monto").numFmt = "#,##0"; sheet.autoFilter = { from: "A1", to: "Q1" };
  const bytes = await workbook.xlsx.writeBuffer(); return new Response(bytes as ArrayBuffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename=oasis-caja-chica.xlsx" } });
}
