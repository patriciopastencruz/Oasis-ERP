import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { closingReportData } from "@/modules/finance/distribution/application/queries";
import { buildDailyClosurePdf } from "@/modules/finance/distribution/application/reports-pdf";

export async function GET(request: NextRequest) {
  const date = z
    .string()
    .date()
    .parse(request.nextUrl.searchParams.get("date"));
  const d = await closingReportData(date);
  if (!d.ctx.permissions.has("finance.distribution.reports.export"))
    return new NextResponse("No autorizado", { status: 403 });
  const bytes = await buildDailyClosurePdf({
    date,
    summary: d.summary,
    extras: {
      monthLabel: new Date(`${d.accumulated.month_start}T12:00:00Z`).toLocaleDateString("es-CL", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }),
      closure: d.closure,
      closingProducts: d.closingProducts,
      metrics: d.metrics,
      kgDays: d.kgDays,
      incomeDays: d.incomeDays,
      day: d.accumulated.day,
    },
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cierre-distribuidora-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
