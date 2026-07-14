import { NextRequest } from "next/server";
import { pettyCashReport } from "@/modules/finance/petty-cash/application/report-query";

export async function GET(request: NextRequest) {
  const rows = await pettyCashReport(request.nextUrl.searchParams);
  const headers = ["Correlativo","Trabajador","Unidad","Semana","Fecha del gasto","Comercio","Tipo de documento","Número de documento","Categoría","Centro de costo","Descripción","Monto","Estado","Administrador aprobador","Fecha de aprobación","Observaciones","Comprobante"];
  const keys = ["correlativo","trabajador","unidad","semana","fecha_gasto","comercio","tipo_documento","numero_documento","categoria","centro_costo","descripcion","monto","estado","administrador","fecha_aprobacion","observaciones","comprobante"] as const;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[headers.map(escape).join(";"), ...rows.map((row) => keys.map((key) => escape(row[key])).join(";"))].join("\n")}`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=oasis-caja-chica.csv" } });
}
