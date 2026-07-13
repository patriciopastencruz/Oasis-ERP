import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { paymentReport } from "@/modules/finance/payment-control/application/report-query";
export async function GET(req: NextRequest) {
  const rows = await paymentReport(req.nextUrl.searchParams),
    wb = new ExcelJS.Workbook(),
    ws = wb.addWorksheet("Gestión de Pagos", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
  const columns: Array<[string, string, number]> = [
    ["Correlativo", "correlativo", 20],
    ["Fecha", "fecha", 20],
    ["Solicitante", "solicitante", 24],
    ["Unidad", "unidad", 24],
    ["Proveedor", "proveedor", 28],
    ["RUT", "rut", 15],
    ["Banco", "banco", 18],
    ["Tipo cuenta", "tipo_cuenta", 16],
    ["Cuenta", "cuenta", 16],
    ["Categoría", "categoria", 20],
    ["Centro de costo", "centro_costo", 22],
    ["Monto CLP", "monto", 16],
    ["Prioridad", "prioridad", 12],
    ["Estado", "estado", 18],
    ["Aprobador", "aprobador", 24],
    ["Fecha aprobación", "fecha_aprobacion", 20],
    ["Fecha programada", "fecha_programada", 18],
    ["Fecha real", "fecha_pago", 20],
    ["Medio", "medio", 18],
    ["Operación", "operacion", 18],
    ["Observaciones", "observaciones", 35],
  ];
  ws.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  rows.forEach((x) => ws.addRow(x));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF173F2D" },
  };
  ws.getColumn("monto").numFmt = "#,##0";
  ws.autoFilter = { from: "A1", to: "U1" };
  const bytes = await wb.xlsx.writeBuffer();
  return new Response(bytes as ArrayBuffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=oasis-control-pagos.xlsx",
    },
  });
}
