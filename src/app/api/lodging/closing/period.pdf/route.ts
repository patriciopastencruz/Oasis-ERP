import { NextRequest, NextResponse } from "next/server";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadPeriodReport } from "@/modules/lodging/application/period-queries";
import { buildPeriodReportPdf } from "@/modules/lodging/application/period-pdf";
import { isValidDay, santiagoToday, type PeriodKind } from "@/modules/lodging/domain/daily-closing";

export async function GET(request: NextRequest) {
  const { unit, supabase } = await lodgingContext("lodging.closings.reports");
  const params = request.nextUrl.searchParams;
  const kind: PeriodKind = params.get("period") === "fortnight" ? "fortnight" : "week";
  const today = santiagoToday();
  const date = params.get("date") ?? undefined;
  const reference = isValidDay(date) && date <= today ? date : today;
  const report = await loadPeriodReport(supabase, unit.id, kind, reference);
  const bytes = await buildPeriodReportPdf({ unit, report });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resumen-${kind === "week" ? "semanal" : "quincenal"}-${unit.code.toLowerCase()}-${report.range.start}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
