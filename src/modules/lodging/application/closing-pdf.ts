import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  clp,
  formatClosingDate,
  pct,
  periodLabels,
  type ClosingHistoryRow,
  type DailyClosing,
  type PeriodKind,
  type summarizePeriod,
} from "../domain/daily-closing";
import { drawExecutivePage } from "./closing-executive-pdf";

const PAGE: [number, number] = [595, 842];
const MARGIN = 50;
const WIDTH = PAGE[0] - MARGIN * 2;
const LABEL_WIDTH = 250;
const primary = rgb(0.09, 0.25, 0.53);
const ink = rgb(0.12, 0.14, 0.17);
const muted = rgb(0.42, 0.46, 0.52);
const line = rgb(0.25, 0.27, 0.3);
const soft = rgb(0.93, 0.95, 0.98);

/** pdf-lib con fuentes estándar solo admite Latin-1 (WinAnsi). */
const safe = (value: unknown) =>
  String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x0A\x20-\xFF]/g, "");

async function loadLogo(pdf: PDFDocument, unitCode: string) {
  const file = { HOC: "hoc.png", HU: "hu.png", HOB: "hob.png" }[unitCode];
  if (!file) return null;
  try {
    const bytes = await readFile(join(process.cwd(), "public", "business-units", file));
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

class Writer {
  page: PDFPage;
  y = PAGE[1] - MARGIN;
  constructor(
    private pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private title: string,
  ) {
    this.page = pdf.addPage(PAGE);
  }

  ensure(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.pdf.addPage(PAGE);
    this.y = PAGE[1] - MARGIN;
    this.text(`${this.title} (continuación)`, MARGIN, 10, this.bold, muted);
    this.y -= 22;
  }

  text(value: string, x: number, size = 10, font = this.regular, color = ink) {
    this.page.drawText(safe(value), { x, y: this.y, size, font, color });
  }

  wrap(value: string, width: number, size = 10, font = this.regular) {
    const lines: string[] = [];
    for (const paragraph of safe(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
        else {
          if (current) lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  band(title: string) {
    this.ensure(30);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 8, width: WIDTH, height: 24, color: primary });
    const w = this.bold.widthOfTextAtSize(safe(title), 13);
    this.text(title, MARGIN + (WIDTH - w) / 2, 13, this.bold, rgb(1, 1, 1));
    this.y -= 8;
  }

  /** Fila con borde punteado como la planilla manual: etiqueta | valor. */
  row(label: string, value: string, options: { strong?: boolean; alignValue?: "center" | "left" } = {}) {
    const size = 10;
    const valueLines = this.wrap(value || " ", WIDTH - LABEL_WIDTH - 16, size);
    const height = Math.max(20, valueLines.length * 13 + 8);
    this.ensure(height);
    const top = this.y;
    const bottom = top - height;
    const dash = { dashArray: [1.2, 1.2], thickness: 0.6, color: line };
    this.page.drawRectangle({ x: MARGIN, y: bottom, width: WIDTH, height, borderColor: line, borderWidth: 0.6, borderDashArray: [1.2, 1.2] });
    this.page.drawLine({ start: { x: MARGIN + LABEL_WIDTH, y: top }, end: { x: MARGIN + LABEL_WIDTH, y: bottom }, ...dash });
    const labelY = top - height / 2 - 3.5;
    this.page.drawText(safe(label), { x: MARGIN + 6, y: labelY, size, font: this.regular, color: ink });
    const font = options.strong ? this.bold : this.regular;
    let lineY = top - (height - valueLines.length * 13) / 2 - 10;
    for (const text of valueLines) {
      const w = font.widthOfTextAtSize(text, size);
      const x =
        options.alignValue === "left"
          ? MARGIN + LABEL_WIDTH + 8
          : MARGIN + LABEL_WIDTH + (WIDTH - LABEL_WIDTH - w) / 2;
      this.page.drawText(text, { x, y: lineY, size, font, color: ink });
      lineY -= 13;
    }
    this.y = bottom;
  }

  table(columns: { label: string; width: number; align?: "right" }[], rows: string[][]) {
    const header = () => {
      this.ensure(22);
      this.page.drawRectangle({ x: MARGIN, y: this.y - 16, width: WIDTH, height: 18, color: soft });
      let x = MARGIN + 4;
      for (const c of columns) {
        const w = this.bold.widthOfTextAtSize(safe(c.label), 8);
        this.page.drawText(safe(c.label), { x: c.align === "right" ? x + c.width - w - 8 : x, y: this.y - 11, size: 8, font: this.bold, color: primary });
        x += c.width;
      }
      this.y -= 18;
    };
    header();
    for (const cells of rows) {
      if (this.y - 16 < MARGIN) {
        this.ensure(40);
        header();
      }
      let x = MARGIN + 4;
      cells.forEach((cell, index) => {
        const c = columns[index];
        let text = safe(cell);
        while (text.length > 1 && this.regular.widthOfTextAtSize(text, 8.5) > c.width - 8) text = text.slice(0, -1);
        const w = this.regular.widthOfTextAtSize(text, 8.5);
        this.page.drawText(text, { x: c.align === "right" ? x + c.width - w - 8 : x, y: this.y - 12, size: 8.5, font: this.regular, color: ink });
        x += c.width;
      });
      this.page.drawLine({ start: { x: MARGIN, y: this.y - 16 }, end: { x: MARGIN + WIDTH, y: this.y - 16 }, thickness: 0.3, color: muted });
      this.y -= 16;
    }
  }

  section(title: string) {
    this.y -= 16;
    this.ensure(40);
    this.text(title.toUpperCase(), MARGIN, 10.5, this.bold, primary);
    this.y -= 8;
  }
}

async function start(unit: { code: string; name: string }, title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} - ${unit.name}`);
  pdf.setAuthor("OASIS ERP");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf, unit.code);
  const w = new Writer(pdf, regular, bold, `${title} - ${unit.name}`);
  drawHeader(w, logo, unit.name);
  return { pdf, w };
}

function drawHeader(w: Writer, logo: PDFImage | null, unitName: string) {
  if (logo) {
    const size = 74;
    w.page.drawImage(logo, { x: (PAGE[0] - size) / 2, y: w.y - size + 10, width: size, height: size });
    w.y -= size + 2;
  }
  const name = safe(unitName.toUpperCase());
  const nw = w.bold.widthOfTextAtSize(name, 14);
  w.text(name, (PAGE[0] - nw) / 2, 14, w.bold, primary);
  w.y -= 26;
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

export async function buildPeriodClosingPdf({
  unit,
  kind,
  range,
  summary,
}: {
  unit: { code: string; name: string };
  kind: PeriodKind;
  range: { start: string; end: string };
  summary: ReturnType<typeof summarizePeriod>;
}) {
  const title = `Cierre ${periodLabels[kind]}`;
  const { pdf, w } = await start(unit, title);
  w.band(title);
  w.row("Período", `${formatClosingDate(range.start)} al ${formatClosingDate(range.end)}`);
  w.row("Días con cierre", `${summary.closedDays} de ${summary.elapsedDays}`);
  w.row("Ingreso Efectivo del Período", clp(summary.totalReceived), { strong: true });
  w.row("Monto Efectivo", clp(summary.byMethod.cash));
  w.row("Monto Transferencia", clp(summary.byMethod.transfer));
  w.row("Monto Tarjeta", clp(summary.byMethod.card));
  w.row("Monto Airbnb", clp(summary.byMethod.airbnb));
  w.row("Monto Otros", clp(summary.byMethod.other));
  w.row("Gasto Acumulado", clp(summary.expenseTotal));
  w.row("Resultado (Ingreso - Gasto)", clp(summary.netResult), { strong: true });
  w.row("Ingreso Promedio Diario", clp(summary.averageDailyIncome));
  w.row("% Ocupación Promedio", pct(summary.occupancyPct));
  w.row("Disponibilidad Promedio", `${summary.averageAvailableRooms.toLocaleString("es-CL", { maximumFractionDigits: 1 })} habitaciones/día`);
  w.row("Venta Promedio por Habitación", clp(summary.averageRate));
  w.row("Monto Pendiente (último cierre)", clp(summary.lastPending));
  if (summary.missingDates.length)
    w.row("Días sin cierre", summary.missingDates.map(formatClosingDate).join(", "), { alignValue: "left" });

  w.section("Detalle por día");
  w.table(
    [
      { label: "Fecha", width: 75 },
      { label: "Ocupación", width: 75, align: "right" },
      { label: "Ingreso", width: 90, align: "right" },
      { label: "Gasto", width: 80, align: "right" },
      { label: "Resultado", width: 90, align: "right" },
      { label: "Pendiente", width: 85, align: "right" },
    ],
    summary.days.map((d) => [
      formatClosingDate(d.closing_date),
      `${d.occupied_rooms}/${d.total_rooms}`,
      clp(d.total_received),
      clp(d.expense_total),
      clp(d.net_result),
      clp(d.pending_amount),
    ]),
  );
  w.y -= 20;
  w.ensure(14);
  w.text(
    `Generado el ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })} · Solo considera cierres emitidos · OASIS ERP`,
    MARGIN,
    8,
    w.regular,
    muted,
  );
  return pdf.save();
}
