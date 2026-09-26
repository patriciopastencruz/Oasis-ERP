import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ClosingHistoryRow, DailyClosing } from "../domain/daily-closing";
import { drawExecutivePage } from "./closing-executive-pdf";

export async function loadLogo(pdf: PDFDocument, unitCode: string) {
  const file = { HOC: "hoc.png", HU: "hu.png", HOB: "hob.png" }[unitCode];
  if (!file) return null;
  try {
    const bytes = await readFile(join(process.cwd(), "public", "business-units", file));
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/** PDF del cierre diario: una sola página, la hoja ejecutiva. */
export async function buildDailyClosingPdf({
  unit,
  closing,
  history,
  issuedBy,
}: {
  unit: { code: string; name: string };
  closing: DailyClosing;
  history: ClosingHistoryRow[];
  issuedBy?: string | null;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cierre Diario - ${unit.name}`);
  pdf.setAuthor("OASIS ERP");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf, unit.code);
  drawExecutivePage(pdf, { regular, bold }, logo, { unitName: unit.name, closing, history, issuedBy });
  return pdf.save();
}
