import { NextRequest, NextResponse } from "next/server";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadCashReport } from "@/modules/lodging/application/cash-queries";
import { buildCashPdf } from "@/modules/lodging/application/cash-pdf";
import { parseHistoryMonth } from "@/modules/lodging/domain/history-report";

/** Detalle del efectivo del mes: el hostal elegido, o todos los del usuario con `unit=all`. */
export async function GET(request: NextRequest) {
  const ctx = await requirePermission("lodging.closings.reports");
  const month = parseHistoryMonth(request.nextUrl.searchParams.get("month"));
  const hostels = lodgingUnitCodes
    .map((code) => ctx.units.find((u) => u.code === code))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const selected = request.cookies.get("oasis_unit")?.value;
  const units =
    request.nextUrl.searchParams.get("unit") === "all"
      ? hostels
      : hostels.filter((u) => u.id === selected).concat(hostels).slice(0, 1);
  if (!units.length) return NextResponse.json({ error: "Sin hostales asignados" }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const sections = await Promise.all(
    units.map(async (u) => ({ unit: { code: u.code, name: u.name }, report: await loadCashReport(supabase, u.id, month) })),
  );
  const bytes = await buildCashPdf(sections);
  const name = units.length === 1 ? units[0].code.toLowerCase() : "hostales";
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="efectivo-${name}-${month}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
