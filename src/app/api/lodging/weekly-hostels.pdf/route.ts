import { NextRequest, NextResponse } from "next/server";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadGroupWeeklyReport } from "@/modules/lodging/application/group-weekly-queries";
import { buildGroupWeeklyPdf } from "@/modules/lodging/application/group-weekly-pdf";
import { addDays, defaultClosingDate, isValidDay, santiagoToday } from "@/modules/lodging/domain/daily-closing";

/** Reporte de los hostales del usuario (acumulado del mes al corte), uno por columna. */
export async function GET(request: NextRequest) {
  const ctx = await requirePermission("kpis.view");
  const units = lodgingUnitCodes
    .map((code) => ctx.units.find((u) => u.code === code))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));
  if (!units.length) return NextResponse.json({ error: "Sin hostales asignados" }, { status: 403 });
  const today = santiagoToday();
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  // Día de recepción en curso (de madrugada sigue siendo el de ayer): aún sin
  // cierre. Por defecto el corte es el día anterior a ese.
  const workingDay = defaultClosingDate();
  const reference = isValidDay(date) && date <= today ? date : addDays(workingDay, -1);
  const report = await loadGroupWeeklyReport(await createSupabaseServerClient(), units, reference, workingDay);
  const bytes = await buildGroupWeeklyPdf(report);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reporte-hostales-al-${report.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
