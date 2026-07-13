import { NextRequest } from "next/server";
import { paymentReport } from "@/modules/finance/payment-control/application/report-query";
export async function GET(req: NextRequest) {
  const rows = await paymentReport(req.nextUrl.searchParams),
    headers = Object.keys(
      rows[0] ?? {
        correlativo: "",
        fecha: "",
        solicitante: "",
        unidad: "",
        proveedor: "",
        rut: "",
        banco: "",
        tipo_cuenta: "",
        cuenta: "",
        categoria: "",
        centro_costo: "",
        monto: "",
        prioridad: "",
        estado: "",
        aprobador: "",
        fecha_aprobacion: "",
        fecha_programada: "",
        fecha_pago: "",
        medio: "",
        operacion: "",
        observaciones: "",
      },
    ),
    esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`,
    csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => esc(r[h as keyof typeof r])).join(","),
      ),
    ].join("\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=oasis-control-pagos.csv",
    },
  });
}
