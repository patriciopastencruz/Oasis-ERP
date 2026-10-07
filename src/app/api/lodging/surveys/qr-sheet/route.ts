import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  surveyBaseUrl,
  surveyUrl,
} from "@/modules/lodging/application/survey-links";

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

// Hoja A4 autocontenida (sin el shell del ERP) con un QR por habitación,
// lista para imprimir y recortar.
export async function GET(req: NextRequest) {
  const ctx = await requirePermission("lodging.surveys.view");
  const selected = req.cookies.get("oasis_unit")?.value;
  const unit =
    ctx.units.find(
      (u) => u.id === selected && lodgingUnitCodes.includes(u.code),
    ) ?? ctx.units.find((u) => lodgingUnitCodes.includes(u.code));
  if (!unit) return Response.json({ error: "Sin unidad" }, { status: 403 });

  const s = await createSupabaseServerClient();
  const { data: rooms } = await s
    .from("lodging_rooms")
    .select("name,survey_token")
    .eq("business_unit_id", unit.id)
    .eq("active", true)
    .order("display_order");
  const base = surveyBaseUrl(req.headers);

  const cards = await Promise.all(
    (rooms ?? []).map(async (room) => {
      const svg = await QRCode.toString(surveyUrl(base, room.survey_token), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
      });
      return `<section class="card">
  <p class="brand">${esc(unit.name)}</p>
  <h2>${esc(room.name)}</h2>
  <div class="qr">${svg}</div>
  <p class="cta">¿Cómo fue tu estadía?</p>
  <p class="hint">Escanea y cuéntanos en 1 minuto.<br>Tu opinión nos ayuda a mejorar.</p>
</section>`;
    }),
  );

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>QR encuesta · ${esc(unit.name)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #241c16; }
  .bar { padding: 12px 16px; background: #f1f5f9; display: flex; gap: 12px; align-items: center; }
  .bar button { background: #0b4f9c; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font-weight: 600; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; padding: 8mm; }
  .card { border: 1px dashed #b9a98f; border-radius: 6mm; padding: 6mm; text-align: center; break-inside: avoid; }
  .brand { margin: 0; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: #c1652f; font-weight: 700; }
  h2 { margin: 4px 0 8px; font-size: 22px; }
  .qr { width: 55mm; height: 55mm; margin: 0 auto; }
  .qr svg { width: 100%; height: 100%; }
  .cta { margin: 8px 0 2px; font-size: 16px; font-weight: 700; }
  .hint { margin: 0; font-size: 12px; color: #6b5d4f; }
  @media print { .bar { display: none; } .grid { padding: 0; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimir</button><span>${cards.length} habitaciones · ${esc(base)}</span></div>
<div class="grid">${cards.join("\n")}</div>
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
