import { NextRequest, NextResponse } from "next/server";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadMonthly } from "@/modules/lodging/application/monthly-queries";
import { buildMonthlyReportPdf } from "@/modules/lodging/application/monthly-pdf";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";

export async function GET(request: NextRequest) {
  const { unit, supabase } = await lodgingContext("lodging.monthly_closing.view");
  const current = santiagoToday().slice(0, 7);
  const requested = request.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= current ? requested : current;
  const data = await loadMonthly(supabase, unit.id, month);
  const bytes = await buildMonthlyReportPdf({
    unit,
    month,
    status: data.closing?.status ?? "none",
    summary: data.summary,
    ops: data.ops,
    previous: data.previous,
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cierre-mensual-${unit.code.toLowerCase()}-${month}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
