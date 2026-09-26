import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { loadLogo } from "./closing-pdf";
import { clp } from "../domain/daily-closing";
import {
  breakEven,
  buildStatement,
  monthLabel,
  monthName,
  monthlyConclusions,
  percentChange,
  previousMonth,
  type MonthOperations,
  type MonthlySummary,
  type StatementSection,
} from "../domain/monthly-closing";

const W = 595, H = 842, M = 32;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  navy: hex("#0b2f5f"), ink: hex("#16202c"), ink2: hex("#52606f"), muted: hex("#8a96a3"), line: hex("#e3e8ee"),
  card: rgb(1, 1, 1), page: hex("#f3f6fa"), track: hex("#e8edf3"), blue: hex("#2a78d6"), blueSoft: hex("#b9d4f4"),
  prev: hex("#a9b4c0"), good: hex("#0ca30c"), warning: hex("#fab219"), serious: hex("#ec835a"), critical: hex("#d03b3b"), white: rgb(1, 1, 1),
};
// Paleta categórica validada; el color sigue a la sección / medio, no al orden.
const sectionColor: Record<string, Color> = {
  income: hex("#2a78d6"), fixed: hex("#eb6834"), variable: hex("#1baf7a"), investment: hex("#eda100"),
  withdrawal: hex("#e87ba4"), other: hex("#8a96a3"), profit: hex("#0d366b"),
};
const methodColor: Record<string, Color> = { transfer: hex("#2a78d6"), cash: hex("#eb6834"), card: hex("#1baf7a"), airbnb: hex("#eda100"), others: hex("#8a96a3") };
const methodLabel: Record<string, string> = { transfer: "Transferencia", cash: "Efectivo", card: "Tarjeta", airbnb: "Airbnb", others: "Otros" };
// Rampa secuencial azul para el calendario de ocupación (escala 50% → 100%).
const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"].map(hex);
const level = (occ: number) => Math.max(0, Math.min(ramp.length - 1, Math.floor(((occ - 0.5) / 0.5) * ramp.length)));

const safe = (v: unknown) =>
  String(v ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[^\x20-\xFF]/g, " ");
const short = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v) / 1000).toLocaleString("es-CL")} mil`;
const pct = (v: number, d = 1) => `${v.toLocaleString("es-CL", { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type Painter = ReturnType<typeof painter>;
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
  const bar = (x: number, t: number, ww: number, h: number, color: Color) => {
    if (ww <= 0.5) return;
    const r = Math.min(3.5, ww, h / 2);
    page.drawSvgPath(`M 0 0 H ${ww - r} Q ${ww} 0 ${ww} ${r} V ${h - r} Q ${ww} ${h} ${ww - r} ${h} H 0 Z`, { x, y: Y(t), color });
  };
  const card = (x: number, t: number, ww: number, h: number, title: string, note?: string) => {
    round(x, t, ww, h, 8, C.card, C.line);
    text(title.toUpperCase(), x + 12, t + 11, 7.5, B, C.ink2);
    if (note) textR(note, x + ww - 12, t + 11, 7, R, C.muted);
  };
  const delta = (x: number, t: number, value: number | null, suffix: string, unit = "%", goodUp = true) => {
    if (value === null || !Number.isFinite(value)) return;
    if (Math.abs(value) < 0.5) {
      page.drawRectangle({ x, y: Y(t + 4.5), width: 7, height: 1.6, color: C.ink2 });
      text(`sin cambio ${suffix}`, x + 10, t, 7, B, C.ink2);
      return;
    }
    const up = value >= 0;
    page.drawSvgPath(up ? "M 0 6 L 3.5 0 L 7 6 Z" : "M 0 0 L 7 0 L 3.5 6 Z", { x, y: Y(t + 1), color: up === goodUp ? C.good : C.critical });
    text(`${up ? "+" : ""}${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}${unit} ${suffix}`, x + 10, t, 7, B, C.ink2);
  };
  const bullet = (x: number, t: number, lvl: "good" | "warning" | "serious", title: string, detail: string, maxW: number) => {
    const color = { good: C.good, warning: C.warning, serious: C.serious }[lvl];
    page.drawCircle({ x: x + 7, y: Y(t + 7), size: 7, color });
    if (lvl === "good") page.drawSvgPath("M -3 0 L -1 2.5 L 3.5 -2.5", { x: x + 7, y: Y(t + 7), borderColor: C.white, borderWidth: 1.4 });
    else {
      page.drawRectangle({ x: x + 6.3, y: Y(t + 9), width: 1.4, height: 5, color: C.white });
      page.drawRectangle({ x: x + 6.3, y: Y(t + 12), width: 1.4, height: 1.4, color: C.white });
    }
    text(fit(title, maxW, 8.5, B), x + 20, t, 8.5, B);
    text(fit(detail, maxW, 7.5), x + 20, t + 12, 7.5, R, C.ink2);
  };
  return { page, Y, w, text, textR, textC, fit, round, bar, card, delta, bullet };
}

type Input = {
  unit: { code: string; name: string };
  month: string;
  status: "draft" | "closed" | "none";
  summary: MonthlySummary;
  ops: MonthOperations;
  previous: { summary: MonthlySummary | null; ops: MonthOperations | null };
};

export async function buildMonthlyReportPdf(input: Input) {
  const { unit, month, summary, ops, previous } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cierre mensual ${monthLabel(month)} - ${unit.name}`);
  pdf.setAuthor("OASIS ERP");
  const R = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf, unit.code);
  const statement = buildStatement(summary);
  const t = summary.totals;
  const income = Number(t.income);
  const prevT = previous.summary?.totals ?? null;
  const prevName = monthName(previousMonth(month));
  const be = breakEven(summary, ops);
  const share = (v: number) => (income ? pct((v / income) * 100) : "-");
  const statusLabel =
    input.status === "closed" ? "CERRADO" : input.status === "draft" ? "EN PREPARACIÓN" : "SIN INICIAR";
  const pendingLabel = summary.pending.count ? ` · ${summary.pending.count} PAGO(S) PENDIENTE(S)` : "";
  const totalPages = 4;
  const footer = (p: Painter, n: number, note: string) => {
    p.text(`${note} · Generado ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`, M, H - 26, 7, R, C.muted);
    p.textR(`OASIS ERP · Página ${n} de ${totalPages}`, W - M, H - 26, 7, B, C.muted);
  };
  const subPage = (title: string) => {
    const page = pdf.addPage([W, H]);
    const p = painter(page, R, B);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    p.text(`CIERRE MENSUAL · ${monthLabel(month).toUpperCase()} · ${unit.name.toUpperCase()}`, M, 26, 8, B, C.ink2);
    p.text(title, M, 38, 15, B);
    return p;
  };
  const kpis = (p: Painter, top: number, items: { label: string; value: string; hint?: string; delta?: [number | null, string, string?, boolean?] }[]) => {
    const gap = 8, kw = (W - 2 * M - gap * (items.length - 1)) / items.length, kh = 70;
    items.forEach((k, i) => {
      const x = M + i * (kw + gap);
      p.round(x, top, kw, kh, 8, C.card, C.line);
      p.text(k.label.toUpperCase(), x + 10, top + 11, 6.6, B, C.ink2);
      p.text(p.fit(k.value, kw - 20, 14, B), x + 10, top + 26, 14, B);
      if (k.delta) p.delta(x + 10, top + 46, k.delta[0], k.delta[1], k.delta[2] ?? "%", k.delta[3] ?? true);
      if (k.hint) p.text(p.fit(k.hint, kw - 20, 6.5), x + 10, top + 58, 6.5, R, C.muted);
    });
    return top + kh;
  };

  // ======================= Página 1: resumen ejecutivo =======================
  {
    const page = pdf.addPage([W, H]);
    const p = painter(page, R, B);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    page.drawRectangle({ x: 0, y: p.Y(88), width: W, height: 88, color: C.navy });
    const tx = logo ? M + 70 : M;
    if (logo) drawLogo(page, logo, p);
    p.text("INFORME DE CIERRE MENSUAL", tx, 22, 8.5, B, hex("#9fb8d9"));
    p.text(p.fit(unit.name, 300, 19, B), tx, 36, 19, B, C.white);
    p.text(`${ops.nightsSold} noches vendidas · ${pct(ops.occupancy * 100, 0)} ocupación · margen ${share(Number(t.profit))}`, tx, 62, 9, R, hex("#c8d6ea"));
    const title = monthLabel(month);
    p.textR(title.charAt(0).toUpperCase() + title.slice(1), W - M, 28, 12, B, C.white);
    const chip = `${statusLabel}${pendingLabel}`;
    const cw = p.w(chip, 7.5, B) + 20;
    p.round(W - M - cw, 48, cw, 18, 9, input.status === "closed" ? hex("#1f7a3d") : hex("#9a6400"));
    p.textC(chip, W - M - cw / 2, 53.5, 7.5, B, C.white);

    let top = 100;
    p.text("FINANZAS", M, top, 7.5, B, C.ink2);
    top = kpis(p, top + 12, [
      { label: "Ingresos", value: short(income), delta: [percentChange(income, prevT ? Number(prevT.income) : null), `vs ${prevName}`] },
      { label: "Costos fijos", value: short(Number(t.fixed)), hint: `${share(Number(t.fixed))} del ingreso` },
      { label: "Costos variables", value: short(Number(t.variable)), hint: `${share(Number(t.variable))} del ingreso` },
      { label: "Inversión y retiros", value: short(Number(t.investment) + Number(t.withdrawal) + Number(t.other)), hint: `${share(Number(t.investment) + Number(t.withdrawal) + Number(t.other))} del ingreso` },
      { label: "Utilidad", value: short(Number(t.profit)), hint: `Margen ${share(Number(t.profit))}`, delta: [percentChange(Number(t.profit), prevT ? Number(prevT.profit) : null), `vs ${prevName}`] },
    ]);
    top += 10;
    p.text("OPERACIÓN", M, top, 7.5, B, C.ink2);
    top = kpis(p, top + 12, [
      { label: "Ocupación", value: pct(ops.occupancy * 100, 0), delta: [previous.ops ? (ops.occupancy - previous.ops.occupancy) * 100 : null, `vs ${prevName}`, " pts"] },
      { label: "Venta prom. (ADR)", value: clp(ops.adr), delta: [percentChange(ops.adr, previous.ops?.adr), `vs ${prevName}`] },
      { label: "RevPAR", value: clp(ops.revpar), delta: [percentChange(ops.revpar, previous.ops?.revpar), `vs ${prevName}`] },
      { label: "Costo por noche", value: ops.nightsSold ? clp(Number(t.costs) / ops.nightsSold) : "-", hint: ops.nightsSold ? `Utilidad por noche ${clp(Number(t.profit) / ops.nightsSold)}` : undefined },
      { label: "Punto de equilibrio", value: be.occupancy === null ? "-" : pct(be.occupancy * 100, 0), hint: be.nights === null ? "Sin ventas para calcular" : `${Math.ceil(be.nights)} noches mínimas` },
    ]);

    // Conclusiones
    top += 12;
    const lines = monthlyConclusions(summary, ops, previous, statement);
    const ch = 28 + lines.length * 16 + 6;
    p.card(M, top, W - 2 * M, ch, "Conclusiones del mes");
    lines.forEach((c, i) => {
      const tt = top + 27 + i * 16;
      page.drawCircle({ x: M + 16, y: p.Y(tt + 4), size: 2, color: C.blue });
      p.text(p.fit(c, W - 2 * M - 40, 8.3), M + 24, tt, 8.3);
    });
    top += ch + 12;

    // Cascada de ingresos a utilidad (un solo eje)
    const wh = 170;
    p.card(M, top, W - 2 * M, wh, "De ingresos a utilidad");
    drawWaterfall(p, M + 16, top, W - 2 * M - 32, wh, t, income, R, B);
    top += wh + 12;

    // Estructura de costos
    const groups = statement
      .filter((s) => s.key === "fixed" || s.key === "variable")
      .flatMap((s) => s.groups.map((g) => ({ name: g.name, amount: g.total, kind: s.key })))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
    const rows = Math.max(1, Math.ceil(groups.length / 2));
    const eh = Math.min(30 + rows * 24 + 18, H - 40 - top);
    p.card(M, top, W - 2 * M, eh, "Estructura de costos", `${short(Number(t.costs))} · ${share(Number(t.costs))} del ingreso`);
    if (!groups.length) p.text("Aún no hay costos registrados en el mes.", M + 12, top + 30, 8, R, C.ink2);
    const colW = (W - 2 * M - 36) / 2, gmax = groups[0]?.amount ?? 1;
    groups.forEach((g, i) => {
      const x = M + 12 + (i % 2) * (colW + 12), tt = top + 30 + Math.floor(i / 2) * 24;
      if (tt + 16 > top + eh - 16) return;
      const amount = `${clp(g.amount)} · ${share(g.amount)}`;
      p.text(p.fit(g.name, colW - p.w(amount, 7.5, B) - 8, 8), x, tt, 8);
      p.textR(amount, x + colW, tt, 7.5, B);
      p.round(x, tt + 11, colW, 5, 2.5, C.track);
      p.bar(x, tt + 11, (colW * g.amount) / gmax, 5, sectionColor[g.kind]);
    });
    const ly = top + eh - 14;
    p.round(M + 12, ly, 8, 6, 2, sectionColor.fixed);
    p.text("Costo fijo", M + 24, ly - 1, 6.5, R, C.muted);
    p.round(M + 72, ly, 8, 6, 2, sectionColor.variable);
    p.text("Costo variable", M + 84, ly - 1, 6.5, R, C.muted);
    footer(p, 1, "Ingresos = pagos recibidos en el mes");
  }

  // ======================= Página 2: ocupación y ventas =======================
  {
    const p = subPage("Ocupación y ventas del mes");
    let top = 58;
    const ch = 170;
    p.card(M, top, W - 2 * M, ch, `Ingreso cobrado acumulado: ${monthName(month)} vs ${prevName}`);
    drawCumulative(p, top, ch, ops, previous.ops, month, prevName, R, B);
    top += ch + 12;

    const half = (W - 2 * M - 10) / 2, h = 214;
    p.card(M, top, half, h, "Calendario de ocupación");
    drawCalendar(p, top, half, h, ops, R, B);
    p.card(M + half + 10, top, half, h, "Ocupación por día de la semana");
    const wx = M + half + 22, ww = half - 24;
    const valid = ops.weekdayOcc.filter((d) => d.occ !== null);
    const topWd = valid.reduce<(typeof valid)[number] | null>((a, b) => (!a || (b.occ ?? 0) > (a.occ ?? 0) ? b : a), null);
    ops.weekdayOcc.forEach((d, i) => {
      const tt = top + 32 + i * 24;
      p.text(dayNames[i], wx, tt + 1, 8.5, d === topWd ? B : R);
      const bx = wx + 62, bw = ww - 62 - 38;
      p.round(bx, tt + 2, bw, 9, 4.5, C.track);
      if (d.occ !== null) p.bar(bx, tt + 2, bw * d.occ, 9, d === topWd ? C.blue : C.blueSoft);
      p.textR(d.occ === null ? "-" : pct(d.occ * 100, 0), wx + ww, tt + 1, 8.5, B);
    });
    top += h + 12;

    const th = 38 + ops.weeks.length * 20;
    p.card(M, top, W - 2 * M, th, "Semana a semana");
    ([["Semana", 12], ["Días", 110], ["Ingreso cobrado", 145], ["Ocupación", 330], ["ADR", 400], ["RevPAR", 470]] as const).forEach(([l, x]) =>
      p.text(l, M + x, top + 28, 7, B, C.ink2),
    );
    const wmax = Math.max(1, ...ops.weeks.map((w) => w.received));
    ops.weeks.forEach((w, i) => {
      const tt = top + 44 + i * 20;
      if (i) p.page.drawLine({ start: { x: M + 12, y: p.Y(tt - 6) }, end: { x: W - M - 12, y: p.Y(tt - 6) }, thickness: 0.3, color: C.line });
      p.text(`${Number(w.start.slice(8))} al ${Number(w.end.slice(8))}`, M + 12, tt, 8.5, B);
      p.text(String(w.days), M + 110, tt, 8.5);
      p.round(M + 145, tt + 1, 110, 8, 4, C.track);
      p.bar(M + 145, tt + 1, (110 * Math.max(0, w.received)) / wmax, 8, C.blue);
      p.text(short(w.received), M + 262, tt, 8.5, B);
      p.text(pct(w.occ * 100, 0), M + 330, tt, 8.5);
      p.text(clp(w.adr), M + 400, tt, 8.5);
      p.text(clp(w.revpar), M + 470, tt, 8.5);
    });
    footer(p, 2, "Venta y ocupación devengadas por noche desde las reservas");
  }

  // ======================= Página 3: habitaciones y medios de pago =======================
  {
    const p = subPage("Habitaciones, tipos y medios de pago");
    let top = 58;
    const half = (W - 2 * M - 10) / 2, h = 22 + Math.max(3, ops.types.length) * 28 + 8;
    p.card(M, top, half, h, "Ocupación y venta por tipo");
    ops.types.forEach((ty, i) => {
      const tt = top + 32 + i * 28, x = M + 12, ww = half - 24;
      const detail = `${pct(ty.occ * 100, 0)} ocup. · ${clp(ty.adr)} ADR`;
      p.text(p.fit(ty.type, ww - p.w(detail, 8) - 8, 8.5, B), x, tt, 8.5, B);
      p.textR(detail, x + ww, tt, 8, R, C.ink2);
      p.round(x, tt + 13, ww, 7, 3.5, C.track);
      p.bar(x, tt + 13, ww * ty.occ, 7, C.blue);
    });
    const by = summary.lodging_income.by_method ?? {};
    const others = ["booking", "company", "other"].reduce((s, k) => s + Number(by[k] ?? 0), 0);
    const methods = ["transfer", "cash", "card", "airbnb"].map((k) => ({ k, v: Number(by[k] ?? 0) })).concat([{ k: "others", v: others }]).filter((m) => m.v > 0);
    const mTotal = methods.reduce((s, m) => s + m.v, 0);
    p.card(M + half + 10, top, half, h, "Ingresos por medio de pago", clp(Number(summary.lodging_income.total)));
    const mx = M + half + 22, mw = half - 24;
    if (!mTotal) p.text("Sin pagos recibidos en el mes.", mx, top + 32, 8, R, C.ink2);
    let cur = mx;
    methods.forEach((m, i) => {
      const segW = Math.max(mw * (m.v / mTotal) - (i === methods.length - 1 ? 0 : 2), 1);
      p.page.drawRectangle({ x: cur, y: p.Y(top + 32 + 13), width: segW, height: 13, color: methodColor[m.k] });
      cur += mw * (m.v / mTotal);
    });
    methods.forEach((m, i) => {
      const tt = top + 54 + i * 15;
      p.round(mx, tt + 1, 8, 8, 2, methodColor[m.k]);
      p.text(methodLabel[m.k], mx + 14, tt, 8.5);
      p.textR(clp(m.v), mx + mw - 36, tt, 8.5, B);
      p.textR(pct((m.v / mTotal) * 100, 0), mx + mw, tt, 8, R, C.ink2);
    });
    top += h + 12;
    top = drawRoomTable(p, top, ops, R, B);
    top += 12;

    const rh = 112;
    if (top + rh < H - 36) {
      p.card(M, top, W - 2 * M, rh, "Rentabilidad por noche y punto de equilibrio");
      const cols: [string, string, string][] = [
        ["Venta por noche (ADR)", clp(ops.adr), "lo que se cobra en promedio"],
        ["Costo por noche vendida", ops.nightsSold ? clp(Number(t.costs) / ops.nightsSold) : "-", "fijos + variables / noches"],
        ["Utilidad por noche", ops.nightsSold ? clp(Number(t.profit) / ops.nightsSold) : "-", "después de inversión"],
        ["Ocupación mínima", be.occupancy === null ? "-" : pct(be.occupancy * 100, 0), be.nights === null ? "" : `${Math.ceil(be.nights)} noches para cubrir costos`],
      ];
      const cw = (W - 2 * M - 24) / 4;
      cols.forEach(([k, v, hint], i) => {
        const x = M + 12 + i * cw;
        p.text(k, x, top + 30, 7.5, R, C.ink2);
        p.text(v, x, top + 42, 13, B);
        p.text(p.fit(hint, cw - 8, 6.5), x, top + 60, 6.5, R, C.muted);
      });
      const bt = top + rh - 30, bx = M + 12, bw = W - 2 * M - 24;
      p.round(bx, bt, bw, 9, 4.5, C.track);
      p.bar(bx, bt, bw * Math.min(1, ops.occupancy), 9, C.blue);
      p.text(`Ocupación real ${pct(ops.occupancy * 100, 0)}`, bx, bt + 14, 7, B, C.ink2);
      if (be.occupancy !== null && be.occupancy <= 1) {
        const ex = bx + bw * be.occupancy;
        p.page.drawLine({ start: { x: ex, y: p.Y(bt - 5) }, end: { x: ex, y: p.Y(bt + 14) }, thickness: 1.3, color: C.ink });
        p.text(`Equilibrio ${pct(be.occupancy * 100, 0)}`, ex + 4, bt + 14, 7, R, C.ink2);
      }
    }
    footer(p, 3, "Venta por habitación = noches vendidas en el mes x tarifa de la reserva");
  }

  // ======================= Página 4: estado de resultados =======================
  {
    let p = subPage("Estado de resultados");
    const legend: [string, Color][] = [["Automático: reservas", hex("#2a78d6")], ["Automático: cierres diarios", hex("#1baf7a")], ["Ingreso manual", hex("#8a96a3")]];
    let lx = W - M;
    [...legend].reverse().forEach(([l, c]) => {
      lx -= p.w(l, 6.5) + 18;
      p.round(lx, 34, 8, 8, 2, c);
      p.text(l, lx + 11, 34.5, 6.5, R, C.ink2);
    });
    const rows = statementRows(statement);
    const rowH = 11.3, col = { label: M + 14, amount: M + 360, pct: M + 410, payer: M + 425, status: W - M - 14 };
    // Reparte las filas por página antes de dibujar, para pintar primero la tarjeta.
    const firstTop = 56, perPage = Math.floor((H - 44 - (firstTop + 26) - 6) / rowH);
    const chunks: Row[][] = [];
    for (let i = 0; i < rows.length; i += perPage) chunks.push(rows.slice(i, i + perPage));
    let y = 0;
    chunks.forEach((chunk, ci) => {
      if (ci > 0) {
        footer(p, 4, "Continúa en la página siguiente");
        p = subPage("Estado de resultados (continuación)");
      }
      const h = 26 + chunk.length * rowH + 6;
      p.card(M, firstTop, W - 2 * M, h, "Detalle", "Monto · % del ingreso · pagado por · estado");
      y = firstTop + 26;
      for (const r of chunk) {
        drawStatementRow(p, r, y, rowH, income, col, R, B);
        y += rowH;
      }
    });
    const ct = y + 16, chh = 30 + 3 * 26;
    if (ct + chh < H - 36) {
      p.card(M, ct, W - 2 * M, chh, "Control del cierre");
      const x = M + 12, mw = W - 2 * M - 60;
      p.bullet(x, ct + 28, summary.pending.count ? "warning" : "good",
        summary.pending.count ? `${summary.pending.count} gasto(s) pendiente(s) de pago: ${clp(summary.pending.amount)}` : "Sin gastos pendientes de pago",
        summary.lines.filter((l) => l.payment_status === "pendiente").map((l) => l.description).join(", ") || "Todas las líneas están pagadas", mw);
      const daysExpected = ops.elapsedDays;
      p.bullet(x, ct + 54, summary.daily_closings.issued >= daysExpected ? "good" : "warning",
        `${summary.daily_closings.issued} de ${daysExpected} días con cierre diario emitido`,
        "Los gastos diarios solo se suman desde cierres emitidos", mw);
      const uncategorized = summary.daily_expenses.find((d) => d.category_id === null);
      p.bullet(x, ct + 80, uncategorized ? "serious" : "good",
        uncategorized ? `Gastos diarios sin categoría: ${clp(uncategorized.amount)}` : "Todos los gastos diarios tienen categoría",
        uncategorized ? "Corresponden a cierres anteriores a la categorización" : "Se agrupan automáticamente en el estado de resultados", mw);
    }
    footer(p, 4, input.status === "closed" ? "Totales fijados al cerrar el mes" : "Borrador: los totales se recalculan hasta cerrar el mes");
  }
  return pdf.save();
}

function drawLogo(page: PDFPage, logo: PDFImage, p: Painter) {
  page.drawCircle({ x: M + 29, y: p.Y(44), size: 29, color: C.white });
  page.drawImage(logo, { x: M + 4, y: p.Y(69), width: 50, height: 50 });
}

function drawWaterfall(p: Painter, cx: number, top: number, cwid: number, ch: number, t: MonthlySummary["totals"], income: number, R: PDFFont, B: PDFFont) {
  const steps = [
    { label: "Ingresos", value: income, kind: "income" },
    { label: "Costos fijos", value: -Number(t.fixed), kind: "fixed" },
    { label: "Costos variables", value: -Number(t.variable), kind: "variable" },
    { label: "Inversión", value: -Number(t.investment), kind: "investment" },
    { label: "Retiros y otros", value: -(Number(t.withdrawal) + Number(t.other)), kind: "withdrawal" },
    { label: "Utilidad", value: Number(t.profit), kind: "profit" },
  ];
  const base = top + ch - 32, plotH = ch - 72;
  // Escala que contempla utilidades negativas (barras bajo la línea base).
  let running = 0, min = 0, max = 0;
  // Los extremos salen de los niveles acumulados (y de ingresos/utilidad), no de los descuentos.
  for (const s of steps) {
    if (s.kind === "income") running = s.value;
    else if (s.kind !== "profit") running += s.value;
    const level = s.kind === "profit" ? s.value : running;
    min = Math.min(min, level);
    max = Math.max(max, level);
  }
  const range = Math.max(1, max - Math.min(0, min));
  const scale = plotH / range;
  // Línea de cero: sube si hay valores negativos para que queden sobre las etiquetas.
  const zero = base + Math.min(0, min) * scale;
  const yOf = (v: number) => zero - v * scale;
  p.page.drawLine({ start: { x: cx, y: p.Y(zero) }, end: { x: cx + cwid, y: p.Y(zero) }, thickness: 0.7, color: C.muted });
  const slot = cwid / steps.length, colW = 44;
  running = 0;
  steps.forEach((s, i) => {
    const x = cx + slot * i + (slot - colW) / 2;
    let a: number, b: number;
    if (s.kind === "income" || s.kind === "profit") {
      a = 0;
      b = s.value;
      if (s.kind === "income") running = s.value;
    } else {
      a = running;
      running += s.value;
      b = running;
    }
    const topY = Math.min(yOf(a), yOf(b)), h = Math.abs(yOf(a) - yOf(b));
    if (h > 0.5) p.round(x, topY, colW, h, 3, sectionColor[s.kind]);
    else p.page.drawLine({ start: { x, y: p.Y(yOf(b)) }, end: { x: x + colW, y: p.Y(yOf(b)) }, thickness: 1, color: C.muted, dashArray: [2, 2] });
    if (i < steps.length - 1) {
      const ly = yOf(running);
      p.page.drawLine({ start: { x: x + colW, y: p.Y(ly) }, end: { x: x + slot, y: p.Y(ly) }, thickness: 0.5, color: C.muted, dashArray: [1.5, 1.5] });
    }
    const label = s.value === 0 ? "$0" : short(s.value);
    const labelTop = s.kind === "income" || (s.kind === "profit" && s.value >= 0) ? topY - 12 : topY + h + 3;
    p.textC(label, x + colW / 2, Math.min(labelTop, base - 10), 7.5, B);
    p.textC(s.label, x + colW / 2, base + 6, 7.5, s.kind === "profit" ? B : R, s.kind === "profit" ? C.ink : C.ink2);
    if (s.kind !== "income") p.textC(income ? pct((Math.abs(s.value) / income) * 100) : "-", x + colW / 2, base + 17, 6.5, R, C.muted);
  });
}

function drawCumulative(p: Painter, top: number, ch: number, ops: MonthOperations, prev: MonthOperations | null, month: string, prevName: string, R: PDFFont, B: PDFFont) {
  const cx = M + 16, cw = W - 2 * M - 110, base = top + ch - 28, plotH = ch - 64;
  const cum = (o: MonthOperations) => o.days.reduce<number[]>((acc, d) => [...acc, (acc.at(-1) ?? 0) + d.received], []);
  const cs = cum(ops), ca = prev ? cum(prev) : [];
  const max = Math.max(1, cs.at(-1) ?? 0, ca.at(-1) ?? 0) * 1.05;
  for (const g of [0.5, 1]) {
    p.page.drawLine({ start: { x: cx, y: p.Y(base - plotH * g) }, end: { x: cx + cw, y: p.Y(base - plotH * g) }, thickness: 0.4, color: C.line, dashArray: [2, 2] });
    p.text(short(max * g), cx + 2, base - plotH * g - 10, 6.5, R, C.muted);
  }
  p.page.drawLine({ start: { x: cx, y: p.Y(base) }, end: { x: cx + cw, y: p.Y(base) }, thickness: 0.7, color: C.muted });
  const px = (i: number) => cx + (cw * i) / 30;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${px(i) - cx} ${-(Math.max(0, v) / max) * plotH}`).join(" ");
  if (ca.length > 1) p.page.drawSvgPath(path(ca), { x: cx, y: p.Y(base), borderColor: C.prev, borderWidth: 2, borderDashArray: [4, 3] });
  if (cs.length > 1) p.page.drawSvgPath(path(cs), { x: cx, y: p.Y(base), borderColor: C.blue, borderWidth: 2 });
  const endS = base - (Math.max(0, cs.at(-1) ?? 0) / max) * plotH, endA = base - (Math.max(0, ca.at(-1) ?? 0) / max) * plotH;
  let labS = endS - 10, labA = endA - 10;
  if (Math.abs(labS - labA) < 24) {
    if (labS <= labA) labA = labS + 24;
    else labS = labA + 24;
  }
  const lx = cx + cw + 10;
  const name = monthName(month);
  p.text(name.charAt(0).toUpperCase() + name.slice(1), lx, labS, 7.5, B);
  p.text(short(cs.at(-1) ?? 0), lx, labS + 10, 7.5, R, C.ink2);
  if (ca.length) {
    p.text(prevName.charAt(0).toUpperCase() + prevName.slice(1), lx, labA, 7.5, B, C.ink2);
    p.text(short(ca.at(-1) ?? 0), lx, labA + 10, 7.5, R, C.muted);
  }
  for (const d of [1, 8, 15, 22, 29]) p.textC(String(d), px(d - 1), base + 6, 7, R, C.ink2);
}

function drawCalendar(p: Painter, top: number, half: number, h: number, ops: MonthOperations, R: PDFFont, B: PDFFont) {
  const gx = M + 12, gw = half - 24, cell = gw / 7, gt = top + 30;
  ["L", "M", "M", "J", "V", "S", "D"].forEach((l, i) => p.textC(l, gx + cell * i + cell / 2, gt, 7, B, C.ink2));
  const first = new Date(`${ops.month}-01T12:00:00Z`).getUTCDay();
  const offset = (first + 6) % 7;
  ops.days.forEach((d, i) => {
    const pos = i + offset, col = pos % 7, row = Math.floor(pos / 7);
    const occ = ops.totalRooms ? d.occupied / ops.totalRooms : 0, lvl = level(occ);
    const x = gx + col * cell + 1.5, y = gt + 14 + row * 27;
    p.round(x, y, cell - 3, 24, 4, ramp[lvl]);
    const ink = lvl >= 3 ? C.white : C.ink;
    p.text(String(i + 1), x + 4, y + 3, 6.5, R, ink);
    p.textC(pct(occ * 100, 0), x + (cell - 3) / 2, y + 12, 7.5, B, ink);
  });
  const lt = top + h - 16;
  p.text("50%", gx, lt, 6.5, R, C.muted);
  ramp.forEach((c, i) => p.round(gx + 20 + i * 16, lt, 14, 7, 2, c));
  p.text("100% ocupación", gx + 20 + ramp.length * 16 + 4, lt, 6.5, R, C.muted);
}

function drawRoomTable(p: Painter, top: number, ops: MonthOperations, R: PDFFont, B: PDFFont) {
  const rows = ops.rooms.slice(0, 22);
  const rowH = 15, h = 62 + Math.max(1, rows.length) * rowH;
  const avgOcc = ops.occupancy;
  p.card(M, top, W - 2 * M, h, "Ocupación e ingreso por habitación", `Promedio del hostal ${pct(avgOcc * 100, 0)} · ordenado por venta`);
  const cols = { room: M + 12, type: M + 100, bar: M + 182, occ: M + 298, nights: M + 340, income: M + 378, adr: W - M - 12 };
  const hy = top + 28;
  p.text("Habitación", cols.room, hy, 7, B, C.ink2);
  p.text("Tipo", cols.type, hy, 7, B, C.ink2);
  p.text("Ocupación", cols.bar, hy, 7, B, C.ink2);
  p.textR("Noches", cols.nights + 22, hy, 7, B, C.ink2);
  p.textR("Venta", cols.income + 88, hy, 7, B, C.ink2);
  p.textR("Tarifa prom.", cols.adr, hy, 7, B, C.ink2);
  if (!rows.length) p.text("No hay habitaciones activas.", cols.room, top + 44, 8, R, C.ink2);
  const barW = 108, maxRevenue = Math.max(1, rows[0]?.revenue ?? 1);
  rows.forEach((r, i) => {
    const tt = top + 44 + i * rowH;
    if (i % 2 === 0) p.page.drawRectangle({ x: M + 6, y: p.Y(tt + 11.5), width: W - 2 * M - 12, height: rowH, color: hex("#f7f9fc") });
    const low = r.occ < avgOcc - 0.15;
    p.text(p.fit(r.name, 84, 8.5, B), cols.room, tt, 8.5, B);
    p.text(p.fit(r.type, 78, 7.5), cols.type, tt, 7.5, R, C.ink2);
    p.round(cols.bar, tt + 1, barW, 7, 3.5, C.track);
    p.bar(cols.bar, tt + 1, barW * r.occ, 7, low ? C.serious : C.blue);
    p.text(pct(r.occ * 100, 0), cols.occ, tt, 8.5, low ? B : R);
    p.textR(String(r.nights), cols.nights + 22, tt, 8.5);
    p.round(cols.income, tt + 2, 34, 5, 2.5, C.track);
    p.bar(cols.income, tt + 2, (34 * r.revenue) / maxRevenue, 5, C.blueSoft);
    p.textR(short(r.revenue), cols.income + 88, tt, 8.5, B);
    p.textR(r.nights ? clp(r.adr) : "-", cols.adr, tt, 8.5, R, C.ink2);
  });
  const ax = cols.bar + barW * avgOcc;
  if (rows.length)
    p.page.drawLine({ start: { x: ax, y: p.Y(top + 40) }, end: { x: ax, y: p.Y(top + 44 + rows.length * rowH - 4) }, thickness: 0.8, color: C.ink2, dashArray: [2, 2] });
  const ly = top + h - 14;
  p.round(M + 12, ly, 8, 6, 2, C.serious);
  p.text("Más de 15 puntos bajo el promedio del hostal", M + 24, ly - 1, 6.5, R, C.muted);
  p.page.drawLine({ start: { x: M + 210, y: p.Y(ly + 3) }, end: { x: M + 222, y: p.Y(ly + 3) }, thickness: 0.8, color: C.ink2, dashArray: [2, 2] });
  p.text("Promedio de ocupación", M + 226, ly - 1, 6.5, R, C.muted);
  return top + h;
}

type Row =
  | { kind: "section"; label: string; amount: number; key: string }
  | { kind: "group"; label: string; amount: number }
  | { kind: "item"; label: string; amount: number; source: "reservas" | "diario" | "manual"; payer?: string | null; status?: string }
  | { kind: "total"; label: string; amount: number };

function statementRows(statement: StatementSection[]): Row[] {
  const rows: Row[] = [];
  for (const s of statement) {
    rows.push({ kind: "section", label: s.name, amount: s.total, key: s.key });
    for (const g of s.groups) {
      rows.push({ kind: "group", label: g.name, amount: g.total });
      for (const it of g.items) rows.push({ kind: "item", label: it.label, amount: it.amount, source: it.source, payer: it.payer, status: it.status });
    }
  }
  const income = statement.find((s) => s.key === "income")?.total ?? 0;
  const costs = statement.filter((s) => s.key !== "income").reduce((a, s) => a + s.total, 0);
  rows.push({ kind: "total", label: "Utilidad del mes", amount: income - costs });
  return rows;
}

function drawStatementRow(
  p: Painter,
  r: Row,
  tt: number,
  rowH: number,
  income: number,
  col: { label: number; amount: number; pct: number; payer: number; status: number },
  R: PDFFont,
  B: PDFFont,
) {
  const share = (v: number) => (income ? pct((v / income) * 100) : "-");
  if (r.kind === "section") {
    p.page.drawRectangle({ x: M + 6, y: p.Y(tt + 8.8), width: W - 2 * M - 12, height: rowH, color: hex("#eef3f9") });
    p.round(M + 10, tt + 1, 3, 7, 1, sectionColor[r.key] ?? C.ink);
    p.text(r.label.toUpperCase(), col.label + 2, tt, 7.5, B);
    p.textR(clp(r.amount), col.amount, tt, 7.5, B);
    p.textR(r.key === "income" ? "100%" : share(r.amount), col.pct, tt, 7, B, C.ink2);
  } else if (r.kind === "group") {
    p.text(p.fit(r.label, 300, 7.5, B), col.label + 6, tt, 7.5, B, C.ink2);
    p.textR(clp(r.amount), col.amount, tt, 7.5, B, C.ink2);
  } else if (r.kind === "item") {
    const dot = { reservas: hex("#2a78d6"), diario: hex("#1baf7a"), manual: hex("#8a96a3") }[r.source];
    p.page.drawCircle({ x: col.label + 16, y: p.Y(tt + 3.2), size: 2.2, color: dot });
    p.text(p.fit(r.label, 280, 7.2), col.label + 22, tt, 7.2);
    p.textR(clp(r.amount), col.amount, tt, 7.2);
    p.textR(share(r.amount), col.pct, tt, 6.8, R, C.muted);
    if (r.payer) p.text(p.fit(r.payer, 70, 6.8), col.payer, tt, 6.8, R, C.ink2);
    if (r.status) {
      const pending = r.status === "pendiente";
      p.textR(pending ? "Pendiente" : "Pagado", col.status, tt, 6.8, pending ? B : R, pending ? hex("#9a6400") : C.muted);
      if (pending) p.page.drawCircle({ x: col.status - p.w("Pendiente", 6.8, B) - 6, y: p.Y(tt + 3.2), size: 2.5, color: C.warning });
    }
  } else {
    p.page.drawLine({ start: { x: M + 6, y: p.Y(tt - 2) }, end: { x: W - M - 6, y: p.Y(tt - 2) }, thickness: 0.8, color: C.ink });
    p.text(r.label.toUpperCase(), col.label + 2, tt + 1, 8, B);
    p.textR(clp(r.amount), col.amount, tt + 1, 8, B);
    p.textR(share(r.amount), col.pct, tt + 1, 7.5, B, C.ink2);
  }
}
