import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dailyDistributionData } from "@/modules/finance/distribution/application/queries";
import { buildDailyClosurePdf } from "@/modules/finance/distribution/application/reports-pdf";

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
  const bytes = await buildDailyClosurePdf({ date, summary: d.summary });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cierre-distribuidora-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
