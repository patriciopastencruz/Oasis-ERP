import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { buildSurveyQrPdf } from "@/modules/lodging/application/survey-qr-pdf";
import {
  surveyBaseUrl,
  surveyUrl,
} from "@/modules/lodging/application/survey-links";

// PDF A4 con el QR de una habitación, listo para imprimir.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const ctx = await requirePermission("lodging.surveys.view");
  const roomId = z.string().uuid().safeParse((await params).roomId);
  if (!roomId.success) return Response.json({ error: "Inválido" }, { status: 400 });

  // RLS limita la lectura a habitaciones de las unidades del usuario.
  const s = await createSupabaseServerClient();
  const { data: room } = await s
    .from("lodging_rooms")
    .select("name,survey_token,business_unit_id")
    .eq("id", roomId.data)
    .maybeSingle();
  const unit = ctx.units.find((u) => u.id === room?.business_unit_id);
  if (!room || !unit)
    return Response.json({ error: "No encontrada" }, { status: 404 });

  const bytes = await buildSurveyQrPdf({
    unitName: unit.name,
    roomName: room.name,
    url: surveyUrl(surveyBaseUrl(req.headers), room.survey_token),
  });
  const file = `qr-encuesta-${unit.code}-${room.name}`
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=${file}.pdf`,
    },
  });
}
