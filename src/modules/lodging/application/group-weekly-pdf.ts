import { PDFDocument, StandardFonts, degrees, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { loadLogo } from "./closing-pdf";
import { C, hex } from "./monthly-pdf";
import type { GroupWeeklyReport, HostelWeekly } from "./group-weekly-queries";
import { clp } from "../domain/daily-closing";
import { REVIEW_CATEGORIES, summarizeReviewHistory } from "../domain/review-scores";
import { goalMet, revparGoal } from "../domain/report-goals";

// A4 horizontal: una fila por indicador y una columna por hostal.
const W = 842, H = 595, M = 24, G = 10;
const CW = (W - 2 * M - 2 * G) / 3;
const colX = (i: number) => M + i * (CW + G);

const safe = (v: unknown) =>
  String(v ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[^\x20-\xFF]/g, " ");
const score = (v: number) => v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const pctTxt = (v: number) => `${Math.round(v * 100)}%`;
const longDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T12:00:00Z`));

function painter(page: PDFPage, R: PDFFont, B: PDFFont) {
  const Y = (t: number) => H - t;
  const w = (s: string, size: number, f: PDFFont = R) => f.widthOfTextAtSize(safe(s), size);
  const text = (s: string, x: number, t: number, size: number, f: PDFFont = R, c: Color = C.ink) =>
    page.drawText(safe(s), { x, y: Y(t) - size * 0.78, size, font: f, color: c });
  const textR = (s: string, r: number, t: number, size: number, f: PDFFont = R, c: Color = C.ink) => text(s, r - w(s, size, f), t, size, f, c);
  const textC = (s: string, cx: number, t: number, size: number, f: PDFFont = R, c: Color = C.ink) => text(s, cx - w(s, size, f) / 2, t, size, f, c);
  const fit = (s: string, max: number, size: number, f: PDFFont = R) => {
    let out = safe(s);
    if (w(out, size, f) <= max) return out;
    while (out.length > 1 && w(`${out}...`, size, f) > max) out = out.slice(0, -1);
    return `${out.trimEnd()}...`;
  };
  const round = (x: number, t: number, ww: number, h: number, r: number, color: Color, border?: Color) => {
    if (ww <= 0 || h <= 0) return;
    r = Math.min(r, ww / 2, h / 2);
    page.drawSvgPath(`M ${r} 0 H ${ww - r} Q ${ww} 0 ${ww} ${r} V ${h - r} Q ${ww} ${h} ${ww - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`, {
      x, y: Y(t), color, borderColor: border, borderWidth: border ? 0.6 : 0,
    });
  };
  // Barra vertical con extremo superior redondeado, anclada a la base.
  const column = (x: number, base: number, ww: number, h: number, color: Color) => {
    if (h <= 0.4 || ww <= 0) return;
    const r = Math.min(2, ww / 2, h);
    page.drawSvgPath(`M 0 ${h} V ${r} Q 0 0 ${r} 0 H ${ww - r} Q ${ww} 0 ${ww} ${r} V ${h} Z`, { x, y: Y(base - h), color });
  };
  const line = (x1: number, t1: number, x2: number, t2: number, color: Color = C.line, thickness = 0.6, dash?: number[]) =>
    page.drawLine({ start: { x: x1, y: Y(t1) }, end: { x: x2, y: Y(t2) }, thickness, color, dashArray: dash });
  const delta = (x: number, t: number, value: number | null, unit: string, digits = 1) => {
    if (value === null) return 0;
    if (value === 0) {
      text("sin cambio", x, t, 7, B, C.ink2);
      return w("sin cambio", 7, B);
    }
    const up = value > 0;
    page.drawSvgPath(up ? "M 0 6 L 3.5 0 L 7 6 Z" : "M 0 0 L 7 0 L 3.5 6 Z", { x, y: Y(t + 0.5), color: up ? C.good : C.critical });
    const s = `${up ? "+" : "-"}${Math.abs(value).toLocaleString("es-CL", { maximumFractionDigits: digits })}${unit}`;
    text(s, x + 9, t, 7, B, C.ink2);
    return 9 + w(s, 7, B);
  };
  // Texto vertical (de abajo hacia arriba) que parte en `baseT`.
  const textUp = (s: string, cx: number, baseT: number, size: number, f: PDFFont = R, c: Color = C.ink) =>
    page.drawText(safe(s), { x: cx + size * 0.35, y: Y(baseT), size, font: f, color: c, rotate: degrees(90) });
  // Círculo de meta: verde con visto si se cumple, rojo con X si no.
  const mark = (cx: number, ct: number, ok: boolean, r = 5) => {
    page.drawCircle({ x: cx, y: Y(ct), size: r, color: ok ? C.good : C.critical });
    const k = r / 7;
    page.drawSvgPath(ok ? `M ${-3 * k} 0 L ${-1 * k} ${2.5 * k} L ${3.5 * k} ${-2.5 * k}` : `M ${-2.3 * k} ${-2.3 * k} L ${2.3 * k} ${2.3 * k} M ${-2.3 * k} ${2.3 * k} L ${2.3 * k} ${-2.3 * k}`, {
      x: cx, y: Y(ct), borderColor: C.white, borderWidth: Math.max(1, 1.4 * k * 1.1),
    });
  };
  // Valor actual + "/ meta" en verde + círculo. Devuelve el ancho usado.
  const withGoal = (x: number, t: number, value: string, size: number, goal: string | null, ok: boolean | null, goalSize = size * 0.55) => {
    text(value, x, t, size, B);
    let used = w(value, size, B);
    if (goal === null) return used;
    const gt = t + size * 0.78 - goalSize * 0.78;
    text(` / ${goal}`, x + used, gt, goalSize, B, C.good);
    used += w(` / ${goal}`, goalSize, B);
    if (ok !== null) {
      const r = Math.max(4, goalSize * 0.55);
      mark(x + used + 3 + r, gt + goalSize * 0.4, ok, r);
      used += 3 + 2 * r;
    }
    return used;
  };
  return { page, Y, w, text, textR, textC, textUp, fit, round, column, line, delta, mark, withGoal };
}
type P = ReturnType<typeof painter>;

export async function buildGroupWeeklyPdf(report: GroupWeeklyReport) {
  const pdf = await PDFDocument.create();
  // Todo el reporte es el acumulado del mes, del 1 a la fecha de corte.
  const monthName = longDate(report.reference, { month: "long" });
  const periodLabel = `Del 1 al ${longDate(report.reference, { day: "numeric", month: "long", year: "numeric" })}`;
  pdf.setTitle(`Reporte hostales - ${periodLabel}`);
  pdf.setAuthor("OASIS ERP");
  const R = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logos = await Promise.all(report.hostels.map((h) => loadLogo(pdf, h.unit.code)));
  const hostels = report.hostels.slice(0, 3);
  const generated = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });

  const newPage = (n: number, bandH: number) => {
    const page = pdf.addPage([W, H]);
    const p = painter(page, R, B);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    page.drawRectangle({ x: 0, y: p.Y(bandH), width: W, height: bandH, color: C.navy });
    p.text("REPORTE SEMANAL · HOSTALES OASIS", M, bandH > 44 ? 13 : 9, 7.5, B, hex("#9fb8d9"));
    p.text(periodLabel, M, bandH > 44 ? 26 : 20, bandH > 44 ? 16 : 12, B, C.white);
    p.textR(`Corte al ${dmy(report.reference)}`, W - M, bandH > 44 ? 18 : 12, 9, B, C.white);
    if (bandH > 44) p.textR("Ocupación, venta y RevPAR desde reservas · saldos con pagos confirmados", W - M, 33, 7, R, hex("#c8d6ea"));
    p.text("Acumulado del mes, del 1 a la fecha de corte. Metas en verde: círculo verde = cumplida, rojo = no cumplida. RevPAR meta = venta prom. meta x ocupación meta.", M, H - 16, 6.5, R, C.muted);
    p.textR(`Generado ${generated} · OASIS ERP · Página ${n} de 2`, W - M, H - 16, 6.5, B, C.muted);
    return p;
  };
  const hostelRow = (p: P, top: number) => {
    hostels.forEach((h, i) => {
      const x = colX(i);
      p.round(x, top, CW, 28, 7, C.white, C.line);
      const logo = logos[i];
      if (logo) p.page.drawImage(logo, { x: x + 6, y: p.Y(top + 25), width: 22, height: 22 });
      const tx = x + (logo ? 34 : 10);
      p.text(p.fit(h.unit.name, CW - 120, 10, B), tx, top + 6, 10, B);
      p.text(`${h.month.totalRooms} habitaciones disponibles`, tx, top + 18, 6.8, R, C.ink2);
      p.textR(h.unit.code, x + CW - 10, top + 10, 9, B, C.muted);
    });
    return top + 28;
  };
  const section = (p: P, top: number, n: number, title: string, note?: string) => {
    p.round(M, top + 1, 14, 14, 7, C.navy);
    p.textC(String(n), M + 7, top + 4, 7.5, B, C.white);
    p.text(title.toUpperCase(), M + 20, top + 4, 8, B, C.ink);
    if (note) p.text(note, M + 26 + p.w(title.toUpperCase(), 8, B), top + 4.5, 7, R, C.muted);
    return top + 18;
  };
  const card = (p: P, i: number, top: number, h: number) => p.round(colX(i), top, CW, h, 8, C.card, C.line);

  // ======================= Página 1 =======================
  {
    const p = newPage(1, 46);
    let top = hostelRow(p, 54) + 8;

    // 1. Ocupación del mes
    top = section(p, top, 1, "Ocupación del mes", "habitaciones ocupadas por noche, del 1 al corte");
    const oh = 150;
    hostels.forEach((h, i) => {
      card(p, i, top, oh);
      drawOccupancy(p, h, colX(i), top, oh, R, B);
    });
    top += oh + 8;

    // 2. Venta promedio y RevPAR
    top = section(p, top, 2, "Venta promedio por habitación y RevPAR", "acumulado del mes");
    const vh = 62;
    hostels.forEach((h, i) => {
      card(p, i, top, vh);
      const x = colX(i), half = CW / 2;
      p.line(x + half, top + 10, x + half, top + vh - 10);
      const tiles: [string, number, number | null, string][] = [
        ["Venta prom. habitación", h.month.adr, h.goals.averageRate, `${h.month.nightsSold} noches vendidas`],
        ["RevPAR", h.month.revpar, revparGoal(h.goals), "Venta por habitación disponible"],
      ];
      tiles.forEach(([label, value, goal, hint], k) => {
        const tx = x + 10 + k * half;
        p.text(label.toUpperCase(), tx, top + 10, 6.6, B, C.ink2);
        p.withGoal(tx, top + 23, clp(value), 14, goal === null ? null : clp(goal), goalMet(Math.round(value), goal), 8);
        p.text(p.fit(hint, half - 18, 6.8), tx, top + 44, 6.8, R, C.muted);
      });
    });
    top += vh + 8;

    // 3. Puntaje Booking
    top = section(p, top, 3, "Puntaje en Booking", "detalle por área, como en Reputación en Booking");
    const bh = H - 26 - top;
    hostels.forEach((h, i) => {
      card(p, i, top, bh);
      drawReviews(p, h, colX(i), top, bh, R, B);
    });
  }

  // ======================= Página 2 =======================
  {
    const p = newPage(2, 34);
    let top = hostelRow(p, 42) + 8;

    // 4. Cierres pendientes y saldos por cobrar
    top = section(p, top, 4, "Cierres pendientes y montos pendientes de pago", `cierres de ${monthName} hasta ayer · estadías del mes ya iniciadas`);
    const ph = H - 26 - top;
    hostels.forEach((h, i) => {
      card(p, i, top, ph);
      drawPending(p, h, colX(i), top, ph, R, B);
    });
  }

  return pdf.save();
}

function drawOccupancy(p: P, h: HostelWeekly, x: number, top: number, ch: number, R: PDFFont, B: PDFFont) {
  const m = h.month;
  const g = h.goals.occupancyPct;
  p.withGoal(x + 10, top + 9, pctTxt(m.occupancy), 20, g === null ? null : `${g.toLocaleString("es-CL")}%`, goalMet(Math.round(m.occupancy * 100), g), 11);
  p.text("ocupación del mes", x + 10, top + 31, 7, R, C.ink2);
  p.textR(`${m.nightsSold} de ${m.totalRooms * m.elapsedDays} noches`, x + CW - 10, top + 10, 8, B, C.blue);
  const last = m.days.at(-1);
  if (last && m.totalRooms) p.textR(`Ocupadas el ${Number(last.date.slice(8))}: ${last.occupied} de ${m.totalRooms}`, x + CW - 10, top + 21, 6.8, R, C.ink2);

  // Espacio sobre el 100% para la etiqueta de cada barra.
  const cx = x + 22, cw = CW - 32, base = top + ch - 20, plotH = ch - 78;
  const full = base - plotH;
  p.line(cx, full, cx + cw, full, C.track, 0.6, [2, 2]);
  p.text("100%", x + 4, full - 3, 5.5, R, C.muted);
  p.line(cx, base - plotH / 2, cx + cw, base - plotH / 2, C.track, 0.5, [2, 2]);
  p.text("50%", x + 7, base - plotH / 2 - 3, 5.5, R, C.muted);
  if (g !== null) {
    const gy = base - (Math.min(100, g) / 100) * plotH;
    p.line(cx, gy, cx + cw, gy, C.good, 0.8, [3, 2]);
    p.textR(`Meta ${g.toLocaleString("es-CL")}%`, x + CW - 6, gy - 7, 5.5, B, C.good);
  }
  const n = Math.max(1, m.days.length), slot = cw / n, bw = Math.max(2, Math.min(14, slot - 2));
  m.days.forEach((d, k) => {
    const occ = m.totalRooms ? d.occupied / m.totalRooms : 0;
    const last = k === n - 1;
    const bx = cx + k * slot + (slot - bw) / 2;
    p.column(bx, base, bw, occ * plotH, C.blue);
    const label = pctTxt(occ);
    const f = last ? B : R, ink = last ? C.ink : C.ink2;
    if (p.w(label, 6, f) <= slot - 1) p.textC(label, bx + bw / 2, base - occ * plotH - 9, 6, f, ink);
    else p.textUp(label, bx + bw / 2, base - occ * plotH - 2, 5.2, f, ink);
    const day = Number(d.date.slice(8));
    if (n <= 12 || day === 1 || day % 5 === 0 || k === n - 1) p.textC(String(day), bx + bw / 2, base + 4, 6, last ? B : R, last ? C.ink : C.muted);
  });
  p.line(cx, base, cx + cw, base, C.muted, 0.6);
  if (!m.days.length) p.textC("Sin días en el período", x + CW / 2, top + ch / 2, 8, R, C.muted);
}

function drawReviews(p: P, h: HostelWeekly, x: number, top: number, ch: number, R: PDFFont, B: PDFFont) {
  const s = summarizeReviewHistory(h.reviews);
  if (!s.latest) {
    p.text("Sin registros de puntaje todavía.", x + 10, top + 12, 8, R, C.muted);
    p.text("Se registran en Hospedaje > Reputación en Booking.", x + 10, top + 24, 7, R, C.muted);
    return;
  }
  const sg = h.goals.bookingScore;
  const after = x + 16 + p.withGoal(x + 10, top + 9, score(s.latest.score), 22, sg === null ? null : score(sg), goalMet(Math.round(s.latest.score * 10) / 10, sg), 11);
  p.delta(after, top + 11, s.scoreDelta, " pts");
  p.text(`${s.latest.review_count} comentarios · al ${dmy(s.latest.recorded_on)}`, after, top + 23, 7, R, C.ink2);
  // Detalle por área del último registro.
  const lx = x + 10, lw = CW - 20;
  const areas = REVIEW_CATEGORIES.filter(({ key }) => s.latest!.categories[key] != null);
  const at = top + 42, areaH = Math.min(21, (ch - 50) / Math.max(1, areas.length));
  if (!areas.length) p.text("Sin detalle por área en el registro.", lx, at, 7, R, C.muted);
  areas.forEach(({ key, label }, k) => {
    const v = s.latest!.categories[key]!;
    const ry = at + k * areaH;
    const weakest = s.weakest?.key === key;
    p.text(p.fit(label, lw - 44, 6.8, weakest ? B : R), lx, ry, 6.8, weakest ? B : R, weakest ? C.critical : C.ink);
    // Columna fija a la derecha: valor, "/ meta" en verde y círculo.
    const cg = h.goals.categories[key] ?? null;
    const valueR = lx + lw - 38;
    p.textR(score(v), valueR, ry, 7.2, B);
    if (cg !== null) {
      p.text(`/ ${score(cg)}`, valueR + 3, ry + 0.5, 6.5, B, C.good);
      p.mark(lx + lw - 4, ry + 3.6, goalMet(v, cg)!, 4);
    }
    const d = s.categoryDeltas[key];
    if (d != null && d !== 0) p.textR(`${d > 0 ? "+" : "-"}${score(Math.abs(d))}`, valueR - 16, ry + 0.8, 5.8, B, d > 0 ? C.good : C.critical);
    p.round(lx, ry + 9.5, lw, 3, 1.5, C.track);
    p.round(lx, ry + 9.5, Math.max(3, (lw * Math.min(10, v)) / 10), 3, 1.5, weakest ? C.critical : C.blue);
  });
  if (s.weakest) p.text("En rojo: el área más baja", lx, top + ch - 11, 5.8, R, C.muted);

}

function drawPending(p: P, h: HostelWeekly, x: number, top: number, ch: number, R: PDFFont, B: PDFFont) {
  // Cierres pendientes
  const n = h.pendingClosings.length;
  p.text("CIERRES DIARIOS PENDIENTES", x + 10, top + 10, 6.6, B, C.ink2);
  const color = n === 0 ? C.good : n <= 2 ? C.warning : C.critical;
  p.page.drawCircle({ x: x + 17, y: p.Y(top + 31), size: 7, color });
  if (n === 0) p.page.drawSvgPath("M -3 0 L -1 2.5 L 3.5 -2.5", { x: x + 17, y: p.Y(top + 31), borderColor: C.white, borderWidth: 1.4 });
  else {
    p.page.drawRectangle({ x: x + 16.3, y: p.Y(top + 33), width: 1.4, height: 5, color: C.white });
    p.page.drawRectangle({ x: x + 16.3, y: p.Y(top + 36), width: 1.4, height: 1.4, color: C.white });
  }
  p.text(n === 0 ? "Al día" : `${n} ${n === 1 ? "día" : "días"} sin cierre`, x + 30, top + 25, 13, B);
  let cx = x + 10, cy = top + 46;
  const maxChipsY = top + 46 + 2 * 14;
  for (let k = 0; k < n; k++) {
    const label = dm(h.pendingClosings[k]);
    const cw = p.w(label, 7, B) + 10;
    if (cx + cw > x + CW - 34) {
      cx = x + 10;
      cy += 14;
    }
    if (cy >= maxChipsY) {
      p.text(`+${n - k} más`, cx, cy + 3, 7, B, C.ink2);
      break;
    }
    p.round(cx, cy, cw, 11, 5.5, hex("#fdf0d5"));
    p.text(label, cx + 5, cy + 2.5, 7, B, hex("#7a4b00"));
    cx += cw + 4;
  }

  // Saldos por cobrar
  const st = top + 92;
  p.line(x + 10, st - 6, x + CW - 10, st - 6);
  const b = h.balances;
  p.text("MONTOS PENDIENTES DE PAGO", x + 10, st, 6.6, B, C.ink2);
  p.text(clp(b.total), x + 10, st + 11, 16, B, b.total > 0 ? C.ink : C.good);
  p.mark(x + 10 + p.w(clp(b.total), 16, B) + 11, st + 17.5, b.total <= 0, 6);
  const sub = b.rows.length
    ? `${b.rows.length} ${b.rows.length === 1 ? "reserva" : "reservas"}${b.postpaid ? ` · empresa postpago ${clp(b.postpaid)}` : ""}`
    : "Sin saldos por cobrar";
  p.text(p.fit(sub, CW - 20, 7), x + 10, st + 31, 7, R, C.ink2);
  const lt = st + 46, rowH = 13;
  const maxRows = Math.floor((top + ch - 10 - lt) / rowH);
  const shown = b.rows.slice(0, b.rows.length > maxRows ? maxRows - 1 : maxRows);
  shown.forEach((r, k) => {
    const ry = lt + k * rowH;
    p.text(p.fit(r.room, 46, 7, B), x + 10, ry, 7, B);
    const who = `${r.guest ?? "Sin huésped"} · ${dm(r.check_in)}${r.postpaid_company ? " · empresa" : ""}`;
    p.text(p.fit(who, CW - 130, 7), x + 58, ry, 7, R, C.ink2);
    p.textR(clp(r.balance), x + CW - 10, ry, 7, B);
    if (k < shown.length - 1) p.line(x + 10, ry + 9.5, x + CW - 10, ry + 9.5, C.track, 0.4);
  });
  if (shown.length < b.rows.length) {
    const rest = b.rows.slice(shown.length);
    p.text(`+${rest.length} reservas más`, x + 10, lt + shown.length * rowH, 7, B, C.ink2);
    p.textR(clp(rest.reduce((s, r) => s + r.balance, 0)), x + CW - 10, lt + shown.length * rowH, 7, B, C.ink2);
  }
}
