import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { loadLogo } from "./closing-pdf";
import { C, H, M, W, drawLogo, hex, painter, type Painter } from "./monthly-pdf";
import { clp } from "../domain/daily-closing";
import { monthLabel } from "../domain/monthly-closing";
import { CASH_TYPE_LABELS, type CashReport } from "../domain/cash-report";

export type CashPdfSection = { unit: { code: string; name: string }; report: CashReport };

const ORANGE = hex("#eb6834");
const ROW = 15;
const BOTTOM = H - 40;
const dayTitle = (iso: string) => {
  const label = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const originLabel: Record<string, string> = { airbnb: "Airbnb", booking: "Booking", direct: "Directa", whatsapp: "WhatsApp", company: "Empresa", public_web: "Sitio web", other: "Otro" };

// Columnas de la tabla de detalle (x de inicio, salvo el monto que se alinea a la derecha).
const COL = { time: M + 8, room: M + 42, guest: M + 130, origin: M + 244, type: M + 298, by: M + 372, amount: W - M - 8 };

/** Detalle del efectivo cobrado en el mes, una sección por hostal. */
export async function buildCashPdf(sections: CashPdfSection[]) {
  const pdf = await PDFDocument.create();
  const R = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  const month = sections[0]?.report.month ?? "";
  const generated = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date());

  const newPage = () => {
    const page = pdf.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    return painter(page, R, B);
  };

  const header = async (p: Painter, name: string, code: string | null, subtitle: string) => {
    p.page.drawRectangle({ x: 0, y: p.Y(88), width: W, height: 88, color: C.navy });
    const logo = code ? await loadLogo(pdf, code) : null;
    const tx = logo ? M + 70 : M;
    if (logo) drawLogo(p.page, logo, p);
    p.text("DETALLE DE EFECTIVO", tx, 22, 8.5, B, hex("#9fb8d9"));
    p.text(p.fit(name, 330, 19, B), tx, 36, 19, B, C.white);
    p.text(subtitle, tx, 62, 9, R, hex("#c8d6ea"));
    const label = monthLabel(month);
    p.textR(label.charAt(0).toUpperCase() + label.slice(1), W - M, 28, 12, B, C.white);
  };

  const tableHead = (p: Painter, top: number) => {
    p.round(M, top, W - 2 * M, 18, 4, C.navy);
    const t = top + 5.5;
    p.text("HORA", COL.time, t, 7, B, C.white);
    p.text("HAB.", COL.room, t, 7, B, C.white);
    p.text("HUÉSPED", COL.guest, t, 7, B, C.white);
    p.text("ORIGEN", COL.origin, t, 7, B, C.white);
    p.text("TIPO", COL.type, t, 7, B, C.white);
    p.text("REGISTRÓ", COL.by, t, 7, B, C.white);
    p.textR("MONTO", COL.amount, t, 7, B, C.white);
    return top + 24;
  };

  const tile = (p: Painter, x: number, top: number, w: number, label: string, value: string, color = C.ink) => {
    p.round(x, top, w, 46, 8, C.card, C.line);
    p.text(label.toUpperCase(), x + 10, top + 9, 6.5, B, C.ink2);
    p.text(value, x + 10, top + 23, 14, B, color);
  };

  for (const { unit, report } of sections) {
    let p = newPage();
    await header(p, unit.name, unit.code, `${report.count} pagos en efectivo · ${report.days.length} días con movimiento`);
    const gap = 8;
    const w = (W - 2 * M - 3 * gap) / 4;
    tile(p, M, 104, w, "Efectivo del mes", clp(report.total), ORANGE);
    tile(p, M + (w + gap), 104, w, "Cobrado", clp(report.collected));
    tile(p, M + 2 * (w + gap), 104, w, "Reembolsos", report.refunded ? `-${clp(report.refunded)}` : clp(0), report.refunded ? C.critical : C.ink);
    tile(p, M + 3 * (w + gap), 104, w, "Pagos anulados", report.voidedCount ? `${report.voidedCount} · ${clp(report.voidedTotal)}` : "0", report.voidedCount ? C.serious : C.ink);

    let top = tableHead(p, 166);
    if (!report.days.length) {
      p.text("Sin pagos en efectivo en el mes.", M + 8, top + 6, 9, R, C.ink2);
      continue;
    }
    const ensure = (need: number) => {
      if (top + need <= BOTTOM) return;
      p = newPage();
      top = tableHead(p, M);
    };
    for (const day of report.days) {
      ensure(ROW * 2 + 6);
      p.text(dayTitle(day.day), M + 8, top + 2, 8.5, B, C.navy);
      top += ROW + 2;
      for (const e of day.entries) {
        ensure(ROW);
        p.text(e.time, COL.time, top, 7.5, R, C.ink2);
        p.text(p.fit(e.room ?? "-", 84, 7.5), COL.room, top, 7.5);
        p.text(p.fit(e.guest ?? "Sin nombre", 110, 7.5), COL.guest, top, 7.5);
        p.text(p.fit(e.origin ? (originLabel[e.origin] ?? e.origin) : "-", 50, 7.5), COL.origin, top, 7.5, R, C.ink2);
        p.text(p.fit(CASH_TYPE_LABELS[e.type] ?? e.type, 70, 7.5), COL.type, top, 7.5);
        p.text(p.fit(e.registeredBy ?? "-", 90, 7.5), COL.by, top, 7.5, R, C.ink2);
        p.textR(clp(e.amount), COL.amount, top, 7.5, e.amount < 0 ? B : R, e.amount < 0 ? C.critical : C.ink);
        p.page.drawLine({ start: { x: M + 8, y: p.Y(top + 11) }, end: { x: W - M - 8, y: p.Y(top + 11) }, thickness: 0.4, color: C.line });
        top += ROW;
      }
      p.textR(`Total del día ${clp(day.total)}`, COL.amount, top, 8, B, C.ink);
      top += ROW + 6;
    }
    ensure(30);
    p.round(M, top, W - 2 * M, 24, 6, C.navy);
    p.text("TOTAL EFECTIVO DEL MES", M + 12, top + 8, 8.5, B, C.white);
    p.textR(clp(report.total), W - M - 12, top + 6, 12, B, C.white);
  }

  pages.forEach((page, i) => {
    const p = painter(page, R, B);
    p.text(`Generado el ${generated} · Efectivo = pagos confirmados con medio "Efectivo"; los reembolsos restan`, M, H - 22, 7, R, C.muted);
    p.textR(`Página ${i + 1} de ${pages.length}`, W - M, H - 22, 7, R, C.muted);
  });
  return pdf.save();
}
