import { NextResponse } from "next/server";
import { z } from "zod";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadClosing } from "@/modules/lodging/application/closing-queries";
import { buildDailyClosingPdf } from "@/modules/lodging/application/closing-pdf";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new NextResponse("No encontrado", { status: 404 });
  const { unit, supabase } = await lodgingContext([
    "lodging.closings.create",
    "lodging.closings.reports",
  ]);
  const loaded = await loadClosing(supabase, id);
  if (!loaded || loaded.closing.business_unit_id !== unit.id)
    return new NextResponse("No encontrado", { status: 404 });
  const bytes = await buildDailyClosingPdf({ unit, ...loaded });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cierre-${unit.code.toLowerCase()}-${loaded.closing.closing_date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
