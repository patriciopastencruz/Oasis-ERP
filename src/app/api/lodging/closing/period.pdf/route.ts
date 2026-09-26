import { NextRequest, NextResponse } from "next/server";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadIssuedClosings } from "@/modules/lodging/application/closing-queries";
import { buildPeriodClosingPdf } from "@/modules/lodging/application/closing-pdf";
import {
  isValidDay,
  periodRange,
  santiagoToday,
  summarizePeriod,
  type PeriodKind,
} from "@/modules/lodging/domain/daily-closing";

export async function GET(request: NextRequest) {
  const { unit, supabase } = await lodgingContext("lodging.closings.reports");
  const params = request.nextUrl.searchParams;
  const period = params.get("period");
  const kind: PeriodKind = period === "week" || period === "fortnight" ? period : "month";
  const today = santiagoToday();
  const date = params.get("date") ?? undefined;
  const reference = isValidDay(date) && date <= today ? date : today;
  const range = periodRange(kind, reference);
  const closings = await loadIssuedClosings(supabase, unit.id, range);
  const bytes = await buildPeriodClosingPdf({
    unit,
    kind,
    range,
    summary: summarizePeriod(closings, range, today),
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cierre-${kind}-${unit.code.toLowerCase()}-${range.start}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
