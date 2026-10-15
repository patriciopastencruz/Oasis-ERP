import { NextRequest, NextResponse } from "next/server";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadReceptionBonus } from "@/modules/lodging/application/bonus-queries";
import { buildBonusPdf } from "@/modules/lodging/application/bonus-pdf";
import { parseHistoryMonth } from "@/modules/lodging/domain/history-report";

/** Respaldo en PDF del bono de recepción del mes (todos los hostales del usuario). */
export async function GET(request: NextRequest) {
  const ctx = await requirePermission("kpis.view");
  const units = lodgingUnitCodes
    .map((code) => ctx.units.find((u) => u.code === code))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));
  if (!units.length) return NextResponse.json({ error: "Sin hostales asignados" }, { status: 403 });
  const month = parseHistoryMonth(request.nextUrl.searchParams.get("month"));
  const bonuses = await loadReceptionBonus(await createSupabaseServerClient(), units, month);
  const monthLabel = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
  const bytes = await buildBonusPdf({ monthLabel, provisional: bonuses[0]?.provisional ?? true, bonuses });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bono-recepcion-${month}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
