import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { clp } from "../domain/daily-closing";
import type { BonusKey, BonusStatus } from "../domain/reception-bonus";
import type { UnitBonus } from "./bonus-queries";

const W = 595.28, H = 841.89, M = 40;
const INK = rgb(0.09, 0.13, 0.17), MUTED = rgb(0.4, 0.45, 0.5), LINE = rgb(0.85, 0.87, 0.9), BLUE = rgb(0.043, 0.31, 0.61);

const safe = (v: unknown) =>
  String(v ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/≥/g, ">=").replace(/…/g, "...").replace(/[^\x20-\xFF]/g, " ");
const num = (v: number, d = 1) => v.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
const status: Record<BonusStatus, string> = { met: "Cumple", half: "Parcial", miss: "No cumple", na: "No evaluado" };
function fmt(key: BonusKey, v: number | null) {
  if (v === null) return "-";
  if (key === "adr") return clp(v);
  if (key === "inspections") return `${Math.round(v)} min`;
  if (key === "order") return "-";
  if (key === "booking") return num(v, 1);
  if (key === "survey") return `${num(v, 2)} / 5`;
  return `${num(v, 1)}%`;
}

/** Respaldo en PDF del bono de recepción de un mes: una sección por hostal con el detalle de cada indicador. */
export async function buildBonusPdf(input: { monthLabel: string; provisional: boolean; bonuses: UnitBonus[] }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Bono de recepcion ${input.monthLabel}`);
  const R = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, size = 9, font: PDFFont = R, color = INK) =>
    page.drawText(safe(s), { x, y: y - size * 0.8, size, font, color });
  const textR = (s: string, right: number, size = 9, font: PDFFont = R, color = INK) =>
    text(s, right - font.widthOfTextAtSize(safe(s), size), size, font, color);
  const rule = () => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  const need = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  text("Bono de recepcion", M, 20, B, BLUE);
  y -= 26;
  text(`${input.monthLabel}${input.provisional ? " - resultado PROVISORIO (el mes aun no termina)" : ""}`, M, 10, R, MUTED);
  y -= 22;
  const total = input.bonuses.reduce((s, b) => s + b.result.amount, 0);
  text(`Total a pagar: ${clp(total)}`, M, 13, B);
  y -= 26;

  const cols = { value: 300, goal: 365, weight: 410, result: 425, points: W - M };
  for (const b of input.bonuses) {
    need(190);
    rule();
    y -= 10;
    text(b.unit.name, M, 12, B, BLUE);
    textR(clp(b.result.amount), W - M, 14, B);
    y -= 18;
    text(
      `${num(b.result.points, 1)} de 100 puntos - bono maximo ${clp(b.config.pool)}${b.result.gateApplied ? ` - orden administrativo sin cumplir, bono al 50% (antes ${clp(b.result.amountBeforeGate)})` : ""}`,
      M, 8.5, R, MUTED,
    );
    y -= 16;
    text("Indicador", M, 8, B, MUTED);
    textR("Valor", cols.value, 8, B, MUTED);
    textR("Meta", cols.goal, 8, B, MUTED);
    textR("Peso", cols.weight, 8, B, MUTED);
    text("Resultado", cols.result - 6, 8, B, MUTED);
    textR("Puntos", cols.points, 8, B, MUTED);
    y -= 13;
    for (const r of b.result.rows) {
      need(26);
      text(r.label, M, 9, R);
      textR(fmt(r.key, r.value), cols.value, 9);
      textR(r.key === "inspections" ? `<= ${r.goal} min` : r.goal === null ? "-" : fmt(r.key, r.goal), cols.goal, 9, R, MUTED);
      textR(String(r.weight), cols.weight, 9);
      text(status[r.status], cols.result - 6, 9, B, r.status === "met" ? rgb(0.05, 0.5, 0.3) : r.status === "miss" ? rgb(0.75, 0.15, 0.15) : MUTED);
      textR(r.status === "na" ? "-" : num(r.earned, 1), cols.points, 9, B);
      y -= 12;
      if (r.note) {
        text(r.note, M + 8, 7.5, R, MUTED);
        y -= 10;
      }
      for (const c of r.criteria) {
        need(12);
        text(`${c.ok ? "Cumple" : "No cumple"} - ${c.label}: ${c.text}`, M + 8, 7.5, R, c.ok ? rgb(0.05, 0.5, 0.3) : rgb(0.75, 0.15, 0.15));
        y -= 10;
      }
    }
    y -= 4;
    text(`Aseo: todos los aseos inspeccionados y, en promedio, dentro de ${b.config.inspectionMaxWait} min de terminado el aseo (cumple o no cumple).`, M, 7, R, MUTED);
    y -= 9;
    text("Orden: cierres diarios antes de las 06:00 del dia siguiente y sin saldos pendientes de estadias terminadas (excluye empresa a credito).", M, 7, R, MUTED);
    y -= 24;
  }
  text(`Generado el ${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date())} - OASIS ERP`, M, 7.5, R, MUTED);
  return pdf.save();
}
