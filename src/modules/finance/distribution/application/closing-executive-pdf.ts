import { rgb, type Color, type PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";
import type { DailyClosurePdfExtras } from "./reports-pdf";
import type { DistributionDailySummary } from "./queries";

const W = 595;
const H = 842;
const M = 32;
const GAP = 10;

const hex = (h: string) =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// Misma paleta del cierre de hospedaje; el color sigue a la forma de pago.
const C = {
  navy: hex("#0b2f5f"),
  ink: hex("#16202c"),
  ink2: hex("#52606f"),
  muted: hex("#8a96a3"),
  line: hex("#e3e8ee"),
  card: rgb(1, 1, 1),
  page: hex("#f3f6fa"),
  track: hex("#e8edf3"),
  blue: hex("#2a78d6"),
  blueSoft: hex("#9cc3ee"),
  good: hex("#0ca30c"),
  warning: hex("#9a6400"),
  critical: hex("#d03b3b"),
  white: rgb(1, 1, 1),
};
const payColor: Record<string, Color> = {
  cash: hex("#eb6834"),
  transfer: hex("#2a78d6"),
  credit: hex("#eda100"),
  other: hex("#8a96a3"),
};

/** pdf-lib con fuentes estándar solo admite Latin-1 (WinAnsi). */
const safe = (value: unknown) =>
  String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\n\x20-\xFF]/g, " ");
const clp = (v: number) => `$${Math.round(v).toLocaleString("es-CL")}`;
const num = (v: number, digits = 0) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const one = (v: number) => num(Math.round(v * 10) / 10, 1);
const pct = (v: number, digits = 0) =>
  `${v.toLocaleString("es-CL", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function drawDistributionClosingPages(
  pdf: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  logo: PDFImage | null,
  input: { date: string; summary: DistributionDailySummary; extras: DailyClosurePdfExtras },
) {
  const { regular: R, bold: B } = fonts;
  const { summary, extras } = input;
  const closed = extras.closure?.status === "closed";
  const dateLabel = capital(
    new Date(`${input.date}T12:00:00Z`).toLocaleDateString("es-CL", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
  const metrics = extras.metrics;
  const groups = extras.closingProducts.groups;
  const iceGroups = groups.filter((g) => g.kind !== "water");
  const waterGroup = groups.find((g) => g.kind === "water");
  const cubeKg = groups.find((g) => g.kind === "cube")?.kg ?? 0;
  const frappeKg = groups.find((g) => g.kind === "frappe")?.kg ?? 0;
  const kgToday = iceGroups.reduce((s, g) => s + g.kg, 0);
  const waterToday = waterGroup?.units ?? 0;
  const waterAvg = (waterGroup?.items ?? []).reduce((s, r) => s + r.monthAvgPerDay, 0);
  const declared = Number(extras.closure?.declared_expenses ?? 0);

  function newPage() {
    const page = pdf.addPage([W, H]);
    const Y = (top: number) => H - top;
    const text = (s: string, x: number, top: number, size: number, font: PDFFont = R, color: Color = C.ink) =>
      page.drawText(safe(s), { x, y: Y(top) - size * 0.78, size, font, color });
    const width = (s: string, size: number, font: PDFFont = R) => font.widthOfTextAtSize(safe(s), size);
    const textR = (s: string, right: number, top: number, size: number, font: PDFFont = R, color: Color = C.ink) =>
      text(s, right - width(s, size, font), top, size, font, color);
    const textC = (s: string, cx: number, top: number, size: number, font: PDFFont = R, color: Color = C.ink) =>
      text(s, cx - width(s, size, font) / 2, top, size, font, color);
    const fit = (s: string, max: number, size: number, font: PDFFont = R) => {
      let out = safe(s).replace(/\s+/g, " ").trim();
      if (width(out, size, font) <= max) return out;
      while (out.length > 1 && width(`${out}...`, size, font) > max) out = out.slice(0, -1);
      return `${out.trimEnd()}...`;
    };
    const wrap = (s: string, max: number, size: number) => {
      const lines: string[] = [];
      for (const paragraph of safe(s).split(/\n+/)) {
        let current = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const candidate = current ? `${current} ${word}` : word;
          if (width(candidate, size) > max && current) {
            lines.push(current);
            current = word;
          } else current = candidate;
        }
        if (current) lines.push(current);
      }
      return lines;
    };
    const round = (x: number, top: number, w: number, h: number, r: number, color: Color, border?: Color) => {
      r = Math.min(r, w / 2, h / 2);
      page.drawSvgPath(
        `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
        { x, y: Y(top), color, borderColor: border, borderWidth: border ? 0.6 : 0 },
      );
    };
    const card = (x: number, top: number, w: number, h: number, title: string, note?: string) => {
      round(x, top, w, h, 8, C.card, C.line);
      text(title.toUpperCase(), x + 12, top + 11, 7.5, B, C.ink2);
      if (note) textR(note, x + w - 12, top + 11, 7, R, C.muted);
    };
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    return { page, Y, text, width, textR, textC, fit, wrap, round, card };
  }

  function header(p: ReturnType<typeof newPage>, title: string, subtitle: string, rightTop: string, badge?: string) {
    const { page, Y, text, textR, textC, round, fit } = p;
    page.drawRectangle({ x: 0, y: Y(92), width: W, height: 92, color: C.navy });
    const titleX = logo ? M + 74 : M;
    if (logo) {
      page.drawCircle({ x: M + 30, y: Y(46), size: 31, color: C.white });
      page.drawImage(logo, { x: M + 3, y: Y(73), width: 54, height: 54 });
    }
    text(title, titleX, 24, 8.5, B, hex("#9fb8d9"));
    text(fit("Distribuidora Altiplánica", 330, 19, B), titleX, 38, 19, B, C.white);
    text(subtitle, titleX, 64, 9, R, hex("#c8d6ea"));
    textR(rightTop, W - M, 30, 12, B, C.white);
    if (badge) {
      round(W - M - 66, 50, 66, 18, 9, badge === "CERRADO" ? hex("#1f7a3d") : hex("#9a6400"));
      textC(badge, W - M - 33, 55.5, 7.5, B, C.white);
    }
  }

  function footer(p: ReturnType<typeof newPage>, n: number) {
    p.text(
      `Generado el ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`,
      M,
      H - 28,
      7,
      R,
      C.muted,
    );
    p.textR(`OASIS ERP · ${n}/2`, W - M, H - 28, 7, B, C.muted);
  }

  // =============== Página 1: el día ===============
  const p1 = newPage();
  {
    const { page, Y, text, textR, round, card, fit, wrap, width } = p1;
    header(
      p1,
      "CIERRE DIARIO",
      "Hielo cubo, hielo frappé y agua",
      dateLabel,
      closed ? "CERRADO" : "ABIERTO",
    );

    // ---- KPIs ----
    const kTop = 108,
      kH = 92,
      kW = (W - 2 * M - 3 * GAP) / 4;
    const kx = (i: number) => M + i * (kW + GAP);

    const delivered = Number(summary.delivered_sales ?? 0);
    const collectedToday = Number(summary.collected ?? 0);
    const dayTotal = Number(summary.planned_sales ?? 0);
    const toDeliver = Math.max(dayTotal - delivered, 0);
    card(kx(0), kTop, kW, kH, "Venta del día");
    text(clp(dayTotal), kx(0) + 12, kTop + 30, 17, B);
    text(`Entregada ${clp(delivered)}`, kx(0) + 12, kTop + 54, 8, R, C.ink2);
    text(
      toDeliver > 0 ? `Por entregar ${clp(toDeliver)}` : "Todo entregado",
      kx(0) + 12,
      kTop + 65,
      8,
      B,
      toDeliver > 0 ? C.warning : C.good,
    );
    text(`A crédito ${clp(Math.max(delivered - collectedToday, 0))}`, kx(0) + 12, kTop + 77, 7.5, R, C.muted);

    card(kx(1), kTop, kW, kH, "Kilos de hielo vendidos");
    text(`${num(kgToday)} kg`, kx(1) + 12, kTop + 30, 17, B);
    text(`Cubo ${num(cubeKg)} · Frappé ${num(frappeKg)}`, kx(1) + 12, kTop + 54, 8, R, C.ink2);
    const pendingKg = iceGroups.reduce((s, g) => s + g.pendingKg, 0);
    text(
      pendingKg > 0 ? `Por entregar ${num(pendingKg)} kg` : "Todo entregado",
      kx(1) + 12,
      kTop + 64,
      7.5,
      B,
      pendingKg > 0 ? C.warning : C.good,
    );
    if (metrics.avgKgPerDay > 0) {
      const change = (kgToday / metrics.avgKgPerDay - 1) * 100;
      page.drawSvgPath(change >= 0 ? "M 0 7 L 4 0 L 8 7 Z" : "M 0 0 L 8 0 L 4 7 Z", {
        x: kx(1) + 12,
        y: Y(kTop + 82),
        color: change >= 0 ? C.good : C.critical,
      });
      text(`${change >= 0 ? "+" : ""}${pct(change)} vs prom. mes (${one(metrics.avgKgPerDay)} kg)`, kx(1) + 24, kTop + 75, 6.8, B, C.ink2);
    }

    card(kx(2), kTop, kW, kH, "Agua vendida");
    text(`${num(waterToday)} un`, kx(2) + 12, kTop + 30, 17, B);
    const topWater = [...(waterGroup?.items ?? [])].sort((a, b) => b.units - a.units)[0];
    text(
      topWater && topWater.units > 0 ? fit(`Más vendida: ${topWater.name}`, kW - 24, 8) : "Sin ventas de agua",
      kx(2) + 12,
      kTop + 54,
      8,
      R,
      C.ink2,
    );
    text(`Prom. del mes ${one(waterAvg)} un/día`, kx(2) + 12, kTop + 66, 7.5, R, C.muted);

    card(kx(3), kTop, kW, kH, "Gastos del día");
    text(closed ? clp(declared) : "Sin declarar", kx(3) + 12, kTop + 30, closed ? 17 : 14, B);
    text(closed ? "Declarados en el cierre" : "Se declaran al cerrar", kx(3) + 12, kTop + 54, 8, R, C.ink2);
    text(`Caja chica ${clp(summary.expense_total ?? 0)}`, kx(3) + 12, kTop + 66, 7.5, R, C.muted);

    // ---- Forma de pago | Cobros ----
    const r2 = kTop + kH + 12,
      r2H = 118,
      halfW = (W - 2 * M - GAP) / 2;
    const day = extras.day ?? {
      delivered: Number(summary.planned_sales ?? 0),
      cash: Number(summary.cash ?? 0),
      transfer: Number(summary.transfer ?? 0),
      credit: Number(summary.credit ?? 0),
    };
    card(M, r2, halfW, r2H, "Venta por forma de pago", `Entregada ${clp(day.delivered)}`);
    const cash = Number(day.cash),
      transfer = Number(day.transfer),
      credit = Number(day.credit);
    const other = Math.max(0, Math.round(Number(day.delivered) - cash - transfer - credit));
    const methods = [
      { key: "cash", label: "Efectivo", amount: cash },
      { key: "transfer", label: "Transferencia", amount: transfer },
      { key: "credit", label: "Crédito", amount: credit },
      { key: "other", label: "Otros (mixto)", amount: other },
    ].filter((x) => x.amount > 0);
    const total = methods.reduce((s, x) => s + x.amount, 0);
    const sx = M + 12,
      sw = halfW - 24,
      st = r2 + 32;
    if (!total) {
      round(sx, st, sw, 14, 4, C.track);
      text("Sin ventas registradas en el día", sx, st + 26, 8.5, R, C.ink2);
    } else {
      let cursor = sx;
      methods.forEach((x, i) => {
        const w = sw * (x.amount / total);
        const first = i === 0,
          last = i === methods.length - 1;
        const segW = Math.max(w - (last ? 0 : 2), 1),
          h = 14,
          r = Math.min(4, segW / 2);
        const path =
          first && last
            ? `M ${r} 0 H ${segW - r} Q ${segW} 0 ${segW} ${r} V ${h - r} Q ${segW} ${h} ${segW - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
            : first
              ? `M ${r} 0 H ${segW} V ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
              : last
                ? `M 0 0 H ${segW - r} Q ${segW} 0 ${segW} ${r} V ${h - r} Q ${segW} ${h} ${segW - r} ${h} H 0 Z`
                : `M 0 0 H ${segW} V ${h} H 0 Z`;
        page.drawSvgPath(path, { x: cursor, y: Y(st), color: payColor[x.key] });
        cursor += w;
      });
      methods.forEach((x, i) => {
        const top = st + 24 + i * 15;
        round(sx, top + 1, 8, 8, 2, payColor[x.key]);
        text(x.label, sx + 14, top, 8.5);
        textR(clp(x.amount), sx + sw - 38, top, 8.5, B);
        textR(pct((x.amount / total) * 100), sx + sw, top, 8, R, C.ink2);
      });
    }

    const px = M + halfW + GAP;
    const totalReceived = Number(summary.total_received ?? 0);
    const fromToday = Math.min(Number(summary.collected ?? 0), totalReceived);
    const fromPast = Math.max(totalReceived - fromToday, 0);
    card(px, r2, halfW, r2H, "Cobros del día", clp(totalReceived));
    const rowsCobros: [string, number, boolean][] = [
      ["Cobrado de las ventas de hoy", fromToday, false],
      ["Cobrado de ventas de días anteriores", fromPast, false],
    ];
    rowsCobros.forEach(([label, amount], i) => {
      const top = r2 + 32 + i * 18;
      text(label, px + 12, top, 8.5, R, C.ink2);
      textR(clp(amount), px + halfW - 12, top, 9, B);
      page.drawLine({ start: { x: px + 12, y: Y(top + 14) }, end: { x: px + halfW - 12, y: Y(top + 14) }, thickness: 0.4, color: C.line });
    });
    const totalTop = r2 + 32 + rowsCobros.length * 18;
    text("Total recibido", px + 12, totalTop, 9, B);
    textR(clp(totalReceived), px + halfW - 12, totalTop, 10, B, C.navy);
    text(
      `En efectivo ${clp(summary.cash_received ?? 0)} · transferencia ${clp(summary.transfer_received ?? 0)}${Number(summary.mixed_received ?? 0) > 0 ? ` · mixto ${clp(summary.mixed_received)}` : ""}`,
      px + 12,
      totalTop + 20,
      7.2,
      R,
      C.ink2,
    );
    text("Las ventas de días anteriores son pagos de pedidos ya entregados.", px + 12, r2 + r2H - 16, 6.8, R, C.muted);

    // ---- Cantidad vendida por producto ----
    const r3 = r2 + r2H + 12;
    const lineH = 14.5;
    const lines = groups.reduce((n, g) => n + (g.items.length ? 2 + g.items.length : 0), 0);
    const r3H = 42 + lines * lineH + 6;
    card(M, r3, W - 2 * M, r3H, "Cantidad vendida por producto", `Hielo en kilos · promedio del mes: ${metrics.days} días corridos`);
    const cols = { name: M + 14, today: M + 330, month: M + 425, avg: W - M - 14 };
    const head = r3 + 28;
    text("PRODUCTO", cols.name, head, 6.5, B, C.muted);
    textR("VENDIDO HOY", cols.today, head, 6.5, B, C.muted);
    textR("ACUM. MES", cols.month, head, 6.5, B, C.muted);
    textR("PROMEDIO / DÍA", cols.avg, head, 6.5, B, C.muted);
    let top = head + 16;
    for (const g of groups) {
      if (!g.items.length) continue;
      const unit = g.kind === "water" ? "" : " kg";
      text(g.label.toUpperCase(), cols.name, top, 7, B, C.navy);
      top += lineH;
      for (const r of g.items) {
        text(fit(r.name, 240, 8.5), cols.name + 8, top, 8.5);
        textR(`${num(r.units)}${unit}`, cols.today, top, 8.5, B);
        textR(`${num(r.monthUnits)}${unit}`, cols.month, top, 8.5);
        textR(`${one(r.monthAvgPerDay)}${unit}`, cols.avg, top, 8.5, R, C.ink2);
        top += lineH;
      }
      page.drawLine({ start: { x: cols.name, y: Y(top - 3) }, end: { x: cols.avg, y: Y(top - 3) }, thickness: 0.4, color: C.line });
      text(`Total ${g.label.toLowerCase()}`, cols.name + 8, top, 8, B, C.ink2);
      textR(`${num(g.units)}${unit}`, cols.today, top, 8.5, B, C.navy);
      top += lineH + 2;
    }

    // ---- Gastos declarados | Observaciones ----
    const r4 = r3 + r3H + 12;
    const r4H = Math.min(H - 52 - r4, 112);
    card(M, r4, halfW, r4H, "Detalle de los gastos", closed ? clp(declared) : undefined);
    const maxLines = Math.floor((r4H - 38) / 12);
    const fill = (value: string | null | undefined, x: number, emptyText: string) => {
      const wrapped = value ? wrap(value, halfW - 24, 8.5) : [emptyText];
      const shown = wrapped.length > maxLines ? [...wrapped.slice(0, maxLines - 1), "(texto completo en el ERP)"] : wrapped;
      shown.forEach((l, i) => text(l, x + 12, r4 + 30 + i * 12, 8.5, R, value && i < wrapped.length ? C.ink : C.muted));
    };
    fill(closed ? extras.closure?.expense_detail : null, M, closed ? "Sin gastos detallados." : "Se declaran al cerrar la jornada.");
    card(px, r4, halfW, r4H, "Observaciones del día");
    fill(closed ? extras.closure?.observations : null, px, closed ? "Sin observaciones." : "Se declaran al cerrar la jornada.");
    void width;
    footer(p1, 1);
  }

  // =============== Página 2: acumulado del mes ===============
  const p2 = newPage();
  {
    const { page, Y, text, textR, round, card, fit } = p2;
    header(p2, "ACUMULADO DEL MES", `${capital(extras.monthLabel)} a la fecha · ${metrics.days} días corridos`, dateLabel);

    // ---- Tarjeta de totales ----
    const t0 = 108,
      tH = 70;
    card(M, t0, W - 2 * M, tH, `${capital(extras.monthLabel)} a la fecha`);
    const tiles: [string, string, string][] = [
      ["Ingreso acumulado", clp(metrics.income), "Venta entregada del 1 a la fecha"],
      ["Kilos de hielo", `${num(metrics.totalKg)} kg`, `Cubo ${num(metrics.kgCube)} · Frappé ${num(metrics.kgFrappe)}`],
      ["Promedio de kilos/día", `${one(metrics.avgKgPerDay)} kg`, "Cubo y frappé"],
      ["Promedio de ingreso/día", clp(metrics.avgIncomePerDay), "Venta entregada"],
    ];
    const tw = (W - 2 * M - 24) / tiles.length;
    tiles.forEach(([label, value, hint], i) => {
      const x = M + 12 + i * tw;
      if (i) page.drawLine({ start: { x: x - 6, y: Y(t0 + 24) }, end: { x: x - 6, y: Y(t0 + tH - 8) }, thickness: 0.5, color: C.line });
      text(fit(label, tw - 10, 7.5), x, t0 + 24, 7.5, R, C.ink2);
      text(fit(value, tw - 10, 13), x, t0 + 35, 13, B);
      text(fit(hint, tw - 10, 6.5), x, t0 + 54, 6.5, R, C.muted);
    });

    // ---- Kilos por día ----
    const c1 = t0 + tH + 12,
      c1H = 215;
    card(M, c1, W - 2 * M, c1H, "Kilos de hielo vendidos por día", "Cubo y frappé");
    const days = extras.kgDays;
    const plotX = M + 14,
      plotW = W - 2 * M - 28,
      plotTop = c1 + 40,
      plotH = c1H - 40 - 38;
    const slot = plotW / Math.max(days.length, 1);
    const maxKg = Math.max(...days.map((d) => d.total), 1);
    const baseTop = plotTop + plotH;
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const yy = baseTop - plotH * f;
      page.drawLine({ start: { x: plotX, y: Y(yy) }, end: { x: plotX + plotW, y: Y(yy) }, thickness: 0.3, color: C.line });
    }
    page.drawLine({ start: { x: plotX, y: Y(baseTop) }, end: { x: plotX + plotW, y: Y(baseTop) }, thickness: 0.6, color: C.muted });
    days.forEach((d, i) => {
      const bw = Math.min(slot * 0.66, 18);
      const x = plotX + i * slot + (slot - bw) / 2;
      const cubeH = (d.cube / maxKg) * plotH;
      const frappeH = (d.frappe / maxKg) * plotH;
      if (cubeH > 0) page.drawRectangle({ x, y: Y(baseTop), width: bw, height: cubeH, color: C.blue });
      if (frappeH > 0) page.drawRectangle({ x, y: Y(baseTop) + cubeH, width: bw, height: frappeH, color: C.blueSoft });
      if (d.total > 0 && days.length <= 20)
        p2.textC(num(d.total), x + bw / 2, baseTop - cubeH - frappeH - 9, 6.5, B, C.navy);
      p2.textC(String(Number(d.date.slice(8))), x + bw / 2, baseTop + 5, 6.5, R, C.muted);
    });
    round(M + 14, c1H + c1 - 22, 8, 8, 2, C.blue);
    text("Hielo cubo", M + 26, c1 + c1H - 22, 7.5, R, C.ink2);
    round(M + 90, c1H + c1 - 22, 8, 8, 2, C.blueSoft);
    text("Hielo frappé", M + 102, c1 + c1H - 22, 7.5, R, C.ink2);
    textR(`Máximo del mes: ${num(maxKg)} kg`, W - M - 14, c1 + c1H - 22, 7.5, R, C.muted);

    // ---- Ingreso acumulado ----
    const c2 = c1 + c1H + 12,
      c2H = 205;
    card(M, c2, W - 2 * M, c2H, "Ingreso acumulado", "Venta entregada acumulada del mes");
    const income = extras.incomeDays;
    const maxIncome = Math.max(...income.map((d) => d.cumulative), 1);
    const iTop = c2 + 40,
      iH = c2H - 40 - 30;
    const iBase = iTop + iH;
    const step = plotW / Math.max(income.length, 1);
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const yy = iBase - iH * f;
      page.drawLine({ start: { x: plotX, y: Y(yy) }, end: { x: plotX + plotW, y: Y(yy) }, thickness: 0.3, color: C.line });
    }
    page.drawLine({ start: { x: plotX, y: Y(iBase) }, end: { x: plotX + plotW, y: Y(iBase) }, thickness: 0.6, color: C.muted });
    const pts = income.map((d, i) => ({ x: plotX + i * step + step / 2, top: iBase - (d.cumulative / maxIncome) * iH }));
    if (pts.length > 1) {
      const poly = pts.map((p) => `${p.x - plotX} ${iBase - p.top}`);
      page.drawSvgPath(`M 0 0 L ${poly.map((v) => `${v.split(" ")[0]} ${-Number(v.split(" ")[1])}`).join(" L ")} L ${pts.at(-1)!.x - plotX} 0 Z`, {
        x: plotX,
        y: Y(iBase),
        color: C.blue,
        opacity: 0.1,
      });
      for (let i = 1; i < pts.length; i++)
        page.drawLine({ start: { x: pts[i - 1].x, y: Y(pts[i - 1].top) }, end: { x: pts[i].x, y: Y(pts[i].top) }, thickness: 1.6, color: C.blue });
    }
    pts.forEach((p, i) => {
      page.drawCircle({ x: p.x, y: Y(p.top), size: 1.8, color: C.blue });
      p2.textC(String(Number(income[i].date.slice(8))), p.x, iBase + 5, 6.5, R, C.muted);
    });
    const lastPoint = pts.at(-1);
    if (lastPoint) textR(clp(income.at(-1)!.cumulative), Math.min(lastPoint.x + 30, W - M - 14), lastPoint.top - 14, 9, B, C.navy);

    // ---- Promedio diario por producto ----
    const c3 = c2 + c2H + 12,
      c3H = Math.min(H - 52 - c3, 100);
    card(M, c3, W - 2 * M, c3H, "Promedio diario por producto", `${metrics.days} días corridos`);
    const avgTiles: [string, string][] = [
      ["Hielo cubo", `${one(metrics.avgKgCubePerDay)} kg/día`],
      ["Hielo frappé", `${one(metrics.avgKgFrappePerDay)} kg/día`],
      ...((waterGroup?.items ?? []).map((r) => [r.name, `${one(r.monthAvgPerDay)} un/día`]) as [string, string][]),
    ];
    const perRow = 3;
    const aw = (W - 2 * M - 24) / perRow;
    avgTiles.slice(0, 6).forEach(([label, value], i) => {
      const x = M + 12 + (i % perRow) * aw;
      const top = c3 + 28 + Math.floor(i / perRow) * 34;
      text(fit(label, aw - 10, 7.5), x, top, 7.5, R, C.ink2);
      text(value, x, top + 11, 12, B);
    });
    footer(p2, 2);
  }
}
