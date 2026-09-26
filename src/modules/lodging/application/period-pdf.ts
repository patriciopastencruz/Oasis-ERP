import { PDFDocument, StandardFonts } from "pdf-lib";
import { loadLogo } from "./closing-pdf";
import { C, H, M, W, drawLogo, drawRoomTable, hex, level, methodColor, methodLabel, painter, pct, ramp, short, type Painter } from "./monthly-pdf";
import { clp, periodLabels } from "../domain/daily-closing";
import type { PeriodReport } from "../domain/period-report";

/** Resumen ejecutivo semanal o quincenal: página 1 indicadores, página 2 habitaciones. */
export async function buildPeriodReportPdf({ unit, report }: { unit: { code: string; name: string }; report: PeriodReport }) {
  const pdf = await PDFDocument.create();
  const kindLabel = periodLabels[report.kind];
  pdf.setTitle(`Resumen ${kindLabel.toLowerCase()} ${report.rangeLabel} - ${unit.name}`);
  pdf.setAuthor("OASIS ERP");
  const R = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf, unit.code);
  const { ops } = report;
  const prevName = report.kind === "week" ? "sem. ant." : "quinc. ant.";
  const footer = (p: Painter, n: number) => {
    p.text(`Cobrado = pagos recibidos · ocupación y venta desde reservas · gastos desde cierres diarios emitidos · Generado ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`, M, H - 26, 6.5, R, C.muted);
    p.textR(`OASIS ERP · Página ${n} de 2`, W - M, H - 26, 7, B, C.muted);
  };

  // ======================= Página 1 =======================
  {
    const page = pdf.addPage([W, H]);
    const p = painter(page, R, B);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    page.drawRectangle({ x: 0, y: p.Y(88), width: W, height: 88, color: C.navy });
    const tx = logo ? M + 70 : M;
    if (logo) drawLogo(page, logo, p);
    p.text(`RESUMEN ${kindLabel.toUpperCase()}`, tx, 22, 8.5, B, hex("#9fb8d9"));
    p.text(p.fit(unit.name, 300, 19, B), tx, 36, 19, B, C.white);
    p.text(`${ops.nightsSold} noches vendidas · ${report.arrivals} llegadas · ${ops.totalRooms} habitaciones`, tx, 62, 9, R, hex("#c8d6ea"));
    p.textR(report.rangeLabel, W - M, 28, 11.5, B, C.white);
    const chip = `${report.closedDays}/${ops.elapsedDays} DÍAS CERRADOS`;
    const cw = p.w(chip, 7.5, B) + 20;
    p.round(W - M - cw, 48, cw, 18, 9, report.missingDates.length ? hex("#9a6400") : hex("#1f7a3d"));
    p.textC(chip, W - M - cw / 2, 53.5, 7.5, B, C.white);

    // KPIs
    let top = 100;
    const items: { label: string; value: string; delta?: [number | null, string]; hint?: string }[] = [
      { label: "Ingreso cobrado", value: short(report.income), delta: [report.deltas.income, "%"] },
      { label: "Ocupación", value: pct(ops.occupancy * 100, 0), delta: [report.deltas.occupancyPts, " pts"] },
      { label: "Venta prom. (ADR)", value: clp(ops.adr), delta: [report.deltas.adr, "%"] },
      { label: "RevPAR", value: clp(ops.revpar), delta: [report.deltas.revpar, "%"] },
      { label: "Resultado", value: short(report.result), hint: `Gasto ${short(report.expenseTotal)}` },
    ];
    const gap = 8, kw = (W - 2 * M - gap * 4) / 5, kh = 70;
    items.forEach((k, i) => {
      const x = M + i * (kw + gap);
      p.round(x, top, kw, kh, 8, C.card, C.line);
      p.text(k.label.toUpperCase(), x + 10, top + 11, 6.6, B, C.ink2);
      p.text(p.fit(k.value, kw - 20, 14, B), x + 10, top + 26, 14, B);
      if (k.delta) p.delta(x + 10, top + 48, k.delta[0], `vs ${prevName}`, k.delta[1]);
      if (k.hint) p.text(p.fit(k.hint, kw - 20, 6.5), x + 10, top + 58, 6.5, R, C.muted);
      if (i === 4 && report.margin !== null) p.text(`Margen ${pct(report.margin, 0)}`, x + 10, top + 46, 7, B, C.ink2);
    });
    top += kh + 12;

    // Cobrado por día + franja de ocupación
    const ch = 190;
    p.card(M, top, W - 2 * M, ch, "Ingreso cobrado por día y ocupación", `Línea punteada: promedio diario ${short(report.income / Math.max(1, ops.elapsedDays))}`);
    const cx = M + 16, cwid = W - 2 * M - 32, base = top + 128, plotH = 86;
    const max = Math.max(1, ...report.days.map((d) => d.received));
    const avg = report.income / Math.max(1, report.days.length);
    page.drawLine({ start: { x: cx, y: p.Y(base) }, end: { x: cx + cwid, y: p.Y(base) }, thickness: 0.7, color: C.muted });
    if (avg > 0) {
      const ay = base - (avg / max) * plotH;
      page.drawLine({ start: { x: cx, y: p.Y(ay) }, end: { x: cx + cwid, y: p.Y(ay) }, thickness: 0.8, color: C.ink2, dashArray: [3, 2] });
    }
    const n = Math.max(1, report.days.length), slot = cwid / n, colW = Math.min(30, slot * 0.62);
    const compact = n > 8;
    report.days.forEach((d) => {
      const i = report.days.indexOf(d), x = cx + slot * i + (slot - colW) / 2, h = (Math.max(0, d.received) / max) * plotH;
      const highlight = d === report.best;
      if (h > 0) p.round(x, base - h, colW, h, Math.min(3, colW / 2), highlight ? C.blue : C.blueSoft);
      if (highlight || !compact) p.textC(short(d.received), x + colW / 2, base - h - 11, compact ? 6.5 : 7, highlight ? B : R, highlight ? C.ink : C.ink2);
      p.textC(compact ? String(Number(d.date.slice(8))) : d.label, x + colW / 2, base + 6, 7, B);
      if (compact) p.textC(d.label.slice(0, 2), x + colW / 2, base + 15, 6, R, C.muted);
      const lvl = level(d.occupancy);
      const cellTop = base + (compact ? 25 : 20);
      p.round(x - 2, cellTop, colW + 4, 15, 3, ramp[lvl]);
      p.textC(pct(d.occupancy * 100, 0), x + colW / 2, cellTop + 4.5, compact ? 6 : 7.5, B, lvl >= 3 ? C.white : C.ink);
    });
    p.text("Ocupación de la noche (color más intenso = mayor ocupación, de 50% a 100%)", cx, top + ch - 14, 6.5, R, C.muted);
    top += ch + 12;

    // Por tipo | medios de pago
    const half = (W - 2 * M - 10) / 2, h2 = 22 + Math.max(3, ops.types.length) * 28 + 8;
    p.card(M, top, half, h2, "Ocupación y venta por tipo");
    ops.types.forEach((ty, i) => {
      const tt = top + 32 + i * 28, x = M + 12, ww = half - 24;
      const detail = `${pct(ty.occ * 100, 0)} ocup. · ${clp(ty.adr)} ADR`;
      p.text(p.fit(ty.type, ww - p.w(detail, 8) - 8, 8.5, B), x, tt, 8.5, B);
      p.textR(detail, x + ww, tt, 8, R, C.ink2);
      p.round(x, tt + 13, ww, 7, 3.5, C.track);
      p.bar(x, tt + 13, ww * ty.occ, 7, C.blue);
    });
    const by = ops.byMethod;
    const others = ["booking", "company", "other"].reduce((s, k) => s + Number(by[k] ?? 0), 0);
    const methods = ["transfer", "cash", "card", "airbnb"].map((k) => ({ k, v: Number(by[k] ?? 0) })).concat([{ k: "others", v: others }]).filter((m) => m.v > 0);
    const mTotal = methods.reduce((s, m) => s + m.v, 0);
    p.card(M + half + 10, top, half, h2, "Ingresos por medio de pago", clp(report.income));
    const mx = M + half + 22, mw = half - 24;
    if (!mTotal) p.text("Sin pagos recibidos en el período.", mx, top + 32, 8, R, C.ink2);
    let cur = mx;
    methods.forEach((m, i) => {
      const segW = Math.max(mw * (m.v / mTotal) - (i === methods.length - 1 ? 0 : 2), 1);
      page.drawRectangle({ x: cur, y: p.Y(top + 45), width: segW, height: 13, color: methodColor[m.k] });
      cur += mw * (m.v / mTotal);
    });
    methods.forEach((m, i) => {
      const tt = top + 54 + i * 15;
      p.round(mx, tt + 1, 8, 8, 2, methodColor[m.k]);
      p.text(methodLabel[m.k], mx + 14, tt, 8.5);
      p.textR(clp(m.v), mx + mw - 36, tt, 8.5, B);
      p.textR(pct((m.v / mTotal) * 100, 0), mx + mw, tt, 8, R, C.ink2);
    });
    top += h2 + 12;

    // Destacados | control
    const h3 = 150;
    p.card(M, top, half, h3, `Destacados de la ${report.kind === "week" ? "semana" : "quincena"}`);
    const highlights: [string, string][] = [
      ["Mejor día", report.best ? `${report.best.label}: ${clp(report.best.received)}` : "Sin cobros"],
      ["Día más bajo", report.worst ? `${report.worst.label}: ${clp(report.worst.received)}` : "Sin cobros"],
      ["Ocupación vie-sáb vs resto", report.weekendOcc === null || report.weekdayOcc === null ? "-" : `${pct(report.weekendOcc * 100, 0)} vs ${pct(report.weekdayOcc * 100, 0)}`],
      ["Habitaciones libres por noche", (ops.totalRooms * (1 - ops.occupancy)).toLocaleString("es-CL", { maximumFractionDigits: 1 })],
      ["Tipo con más demanda", report.topType ? `${report.topType.type} · ${pct(report.topType.occ * 100, 0)}` : "-"],
    ];
    highlights.forEach(([k, v], i) => {
      const tt = top + 28 + i * 23;
      p.text(k, M + 12, tt, 7.2, R, C.ink2);
      p.text(p.fit(v, half - 24, 9, B), M + 12, tt + 9.5, 9, B);
    });
    p.card(M + half + 10, top, half, h3, `Control de la ${report.kind === "week" ? "semana" : "quincena"}`);
    const bx = M + half + 22, bw = half - 56;
    p.bullet(bx, top + 28, report.pendingAtEnd > 0 ? "warning" : "good",
      report.pendingAtEnd > 0 ? `Por cobrar al cierre: ${clp(report.pendingAtEnd)}` : "Sin saldos por cobrar",
      report.pendingRooms.slice(0, 2).map((r) => `${r.room} ${clp(r.balance)}`).join(" · ") || "Según el último cierre emitido", bw);
    p.bullet(bx, top + 56, report.problems.length ? "serious" : "good",
      report.problems.length ? `${report.problems.length} problema(s) reportado(s)` : "Sin problemas reportados",
      report.problems[0]?.text ?? "Recepción no informó incidencias", bw);
    p.bullet(bx, top + 84, report.replenish ? "warning" : "good", report.replenish ? "Reposición pendiente" : "Sin reposiciones pendientes", report.replenish ?? "-", bw);
    p.bullet(bx, top + 112, report.missingDates.length ? "warning" : "good",
      report.missingDates.length ? `${report.missingDates.length} día(s) sin cierre emitido` : "Todos los días con cierre emitido",
      report.withoutPrice ? `${report.withoutPrice} reserva(s) activa(s) sin precio` : "Reservas activas con precio", bw);
    top += h3 + 12;

    // Gastos por categoría
    const gh = H - 40 - top;
    p.card(M, top, W - 2 * M, gh, "Gastos por categoría", `${clp(report.expenseTotal)}${report.income ? ` · ${pct((report.expenseTotal / report.income) * 100)} del ingreso` : ""}`);
    const rowsFit = Math.max(0, Math.floor((gh - 34) / 17));
    const cats = report.expenseCategories.slice(0, rowsFit);
    if (!cats.length) p.text("Sin gastos registrados en cierres emitidos.", M + 12, top + 30, 8, R, C.ink2);
    const gmax = Math.max(1, cats[0]?.amount ?? 1);
    cats.forEach((e, i) => {
      const tt = top + 30 + i * 17, gx = M + 170, gw = W - 2 * M - 170 - 90;
      p.text(p.fit(e.name, 150, 8.5), M + 12, tt, 8.5);
      p.round(gx, tt + 1, gw, 7, 3.5, C.track);
      p.bar(gx, tt + 1, (gw * e.amount) / gmax, 7, hex("#eb6834"));
      p.textR(clp(e.amount), W - M - 12, tt, 8.5, B);
    });
    footer(p, 1);
  }

  // ======================= Página 2 =======================
  {
    const page = pdf.addPage([W, H]);
    const p = painter(page, R, B);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    p.text(`RESUMEN ${kindLabel.toUpperCase()} · ${report.rangeLabel} · ${unit.name.toUpperCase()}`, M, 26, 8, B, C.ink2);
    p.text("Habitaciones y lectura del período", M, 38, 15, B);
    let top = drawRoomTable(p, 58, ops, R, B) + 12;
    const lines = report.conclusions;
    const ch = 28 + Math.max(1, lines.length) * 16 + 6;
    p.card(M, top, W - 2 * M, ch, "Lectura del período");
    lines.forEach((c, i) => {
      const tt = top + 27 + i * 16;
      page.drawCircle({ x: M + 16, y: p.Y(tt + 4), size: 2, color: C.blue });
      p.text(p.fit(c, W - 2 * M - 40, 8.3), M + 24, tt, 8.3);
    });
    top += ch + 12;
    if (report.problems.length && top + 40 < H - 40) {
      const ph = Math.min(28 + report.problems.length * 14 + 6, H - 40 - top);
      p.card(M, top, W - 2 * M, ph, "Problemas reportados");
      report.problems.slice(0, Math.floor((ph - 34) / 14)).forEach((pr, i) => {
        p.text(pr.date.split("-").reverse().join("-"), M + 12, top + 27 + i * 14, 7.5, B, C.ink2);
        p.text(p.fit(pr.text, W - 2 * M - 100, 7.8), M + 80, top + 27 + i * 14, 7.8);
      });
    }
    footer(p, 2);
  }
  return pdf.save();
}

