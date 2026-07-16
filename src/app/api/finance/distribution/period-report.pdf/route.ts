import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { periodDistributionData } from "@/modules/finance/distribution/application/queries";
import { buildPeriodReportPdf } from "@/modules/finance/distribution/application/reports-pdf";

export async function GET(request: NextRequest) {
  const dateFrom = z
    .string()
    .date()
    .parse(request.nextUrl.searchParams.get("from"));
  const dateTo = z
    .string()
    .date()
    .parse(request.nextUrl.searchParams.get("to"));
  const d = await periodDistributionData(
    dateFrom,
    dateTo,
    "finance.distribution.reports.view",
  );
  if (!d.ctx.permissions.has("finance.distribution.reports.export"))
    return new NextResponse("No autorizado", { status: 403 });
  const bytes = await buildPeriodReportPdf({
    dateFrom,
    dateTo,
    summary: d.summary,
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-periodo-distribuidora-${dateFrom}_a_${dateTo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
