import { rgb, type Color, type PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";
import {
  closingPaymentLabels,
  clp,
  executiveContext,
  formatClosingDate,
  longDayLabel,
  type ClosingHistoryRow,
  type ClosingPaymentMethod,
  type DailyClosing,
} from "../domain/daily-closing";

const W = 595;
const H = 842;
const M = 32;

const hex = (h: string) =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// Paleta categórica validada (colorblind-safe) + estados reservados. El color
// sigue al medio de pago, no a su posición: transferencia siempre es azul.
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
  blueSoft: hex("#b9d4f4"),
  good: hex("#0ca30c"),
  warning: hex("#fab219"),
  serious: hex("#ec835a"),
  critical: hex("#d03b3b"),
  white: rgb(1, 1, 1),
};
const methodColor: Record<string, Color> = {
  transfer: hex("#2a78d6"),
  cash: hex("#eb6834"),
  card: hex("#1baf7a"),
  airbnb: hex("#eda100"),
  others: hex("#8a96a3"),
};

/** pdf-lib con fuentes estándar solo admite Latin-1 (WinAnsi). */
const safe = (value: unknown) =>
  String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\n\x20-\xFF]/g, " ");
const pct = (v: number, digits = 0) =>
  `${v.toLocaleString("es-CL", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
const short = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `$${(v / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`
    : `$${Math.round(v / 1000).toLocaleString("es-CL")} mil`;

type Alert = { level: "good" | "warning" | "serious" | "critical"; title: string; detail: string };

export function drawExecutivePage(
  pdf: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  logo: PDFImage | null,
  input: {
    unitName: string;
    closing: DailyClosing;
    history: ClosingHistoryRow[];
    issuedBy?: string | null;
  },
) {
  const { regular: R, bold: B } = fonts;
  const { closing } = input;
  const m = closing.metrics;
  const ctx = executiveContext(closing, input.history);
  const page = pdf.addPage([W, H]);

  // Coordenadas pensadas desde arriba; se convierten al dibujar.
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
  /** Barra anclada a la base: solo el extremo de datos es redondeado. */
  const bar = (x: number, top: number, w: number, h: number, color: Color, direction: "right" | "up") => {
    if (w <= 0 || h <= 0) return;
    const r = Math.min(4, direction === "right" ? Math.min(w, h / 2) : Math.min(h, w / 2));
    const path =
      direction === "right"
        ? `M 0 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H 0 Z`
        : `M 0 ${h} V ${r} Q 0 0 ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h} Z`;
    page.drawSvgPath(path, { x, y: Y(top), color });
  };
  const card = (x: number, top: number, w: number, h: number, title: string, note?: string) => {
    round(x, top, w, h, 8, C.card, C.line);
    text(title.toUpperCase(), x + 12, top + 11, 7.5, B, C.ink2);
    if (note) textR(note, x + w - 12, top + 11, 7, R, C.muted);
  };

  // ---------- Encabezado ----------
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
  page.drawRectangle({ x: 0, y: Y(92), width: W, height: 92, color: C.navy });
  const titleX = logo ? M + 74 : M;
  if (logo) {
    page.drawCircle({ x: M + 30, y: Y(46), size: 31, color: C.white });
    page.drawImage(logo, { x: M + 3, y: Y(73), width: 54, height: 54 });
  }
  text("CIERRE DIARIO", titleX, 24, 8.5, B, hex("#9fb8d9"));
  text(fit(input.unitName, 330, 19, B), titleX, 38, 19, B, C.white);
  text(
    `${m.guests} huéspedes · ${m.arrivals} llegadas · ${m.departures} salidas`,
    titleX,
    64,
    9,
    R,
    hex("#c8d6ea"),
  );
  textR(longDayLabel(closing.closing_date), W - M, 30, 12, B, C.white);
  const issued = closing.status === "issued";
  round(W - M - 66, 50, 66, 18, 9, issued ? hex("#1f7a3d") : hex("#9a6400"));
  textC(issued ? "EMITIDO" : "BORRADOR", W - M - 33, 55.5, 7.5, B, C.white);

  // ---------- KPIs ----------
  const kTop = 108,
    kH = 92,
    gap = 10,
    kW = (W - 2 * M - 3 * gap) / 4;
  const kx = (i: number) => M + i * (kW + gap);
  const occupancy = closing.total_rooms ? closing.occupied_rooms / closing.total_rooms : 0;

  card(kx(0), kTop, kW, kH, "Ingreso del día");
  text(clp(closing.total_received), kx(0) + 12, kTop + 30, 17, B);
  if (ctx.change !== null) {
    const up = ctx.change >= 0;
    page.drawSvgPath(up ? "M 0 7 L 4 0 L 8 7 Z" : "M 0 0 L 8 0 L 4 7 Z", {
      x: kx(0) + 12,
      y: Y(kTop + 60),
      color: up ? C.good : C.critical,
    });
    const days = ctx.week.slice(0, 6).filter((d) => d.income !== null).length;
    text(`${up ? "+" : ""}${pct(ctx.change)} vs prom. ${days} día${days === 1 ? "" : "s"}`, kx(0) + 24, kTop + 60, 8, B, C.ink2);
  } else text("Sin días previos para comparar", kx(0) + 12, kTop + 60, 7.5, R, C.ink2);
  text("Lo que efectivamente entró hoy", kx(0) + 12, kTop + 75, 7, R, C.muted);

  card(kx(1), kTop, kW, kH, "Ocupación");
  const cx = kx(1) + 38,
    cy = kTop + 57,
    rr = 22;
  page.drawCircle({ x: cx, y: Y(cy), size: rr, borderColor: C.track, borderWidth: 7 });
  if (occupancy > 0) {
    const angle = Math.min(occupancy, 0.9999) * 2 * Math.PI;
    page.drawSvgPath(
      `M 0 ${-rr} A ${rr} ${rr} 0 ${angle > Math.PI ? 1 : 0} 1 ${rr * Math.sin(angle)} ${-rr * Math.cos(angle)}`,
      { x: cx, y: Y(cy), borderColor: C.blue, borderWidth: 7 },
    );
  }
  textC(pct(occupancy * 100), cx, cy - 4.5, 10, B);
  text(`${closing.occupied_rooms}/${closing.total_rooms}`, kx(1) + 70, kTop + 42, 15, B);
  text("habitaciones", kx(1) + 70, kTop + 60, 7.5, R, C.ink2);
  text(`${m.available_rooms} disponibles`, kx(1) + 70, kTop + 71, 7.5, R, C.ink2);

  card(kx(2), kTop, kW, kH, "Venta promedio");
  text(clp(closing.average_rate), kx(2) + 12, kTop + 30, 17, B);
  text("por habitación ocupada", kx(2) + 12, kTop + 52, 8, R, C.ink2);
  text(`RevPAR ${clp(closing.average_rate * occupancy)}`, kx(2) + 12, kTop + 66, 8, B, C.ink2);
  text("venta / hab. disponibles", kx(2) + 12, kTop + 77, 7, R, C.muted);

  card(kx(3), kTop, kW, kH, "Resultado del día");
  text(clp(closing.net_result), kx(3) + 12, kTop + 30, 17, B);
  text(`Ingreso ${clp(closing.total_received)}`, kx(3) + 12, kTop + 52, 8, R, C.ink2);
  text(`Gasto ${clp(closing.expense_total)}`, kx(3) + 12, kTop + 64, 8, R, C.ink2);
  text(
    `Pendiente ${clp(closing.pending_amount)}`,
    kx(3) + 12,
    kTop + 76,
    8,
    B,
    closing.pending_amount > 0 ? hex("#9a6400") : C.ink2,
  );

  // ---------- Ocupación por tipo | Medios de pago ----------
  const r2 = kTop + kH + 12,
    r2H = 128,
    halfW = (W - 2 * M - gap) / 2;
  card(M, r2, halfW, r2H, "Ocupación y venta por tipo");
  const types = m.by_type.slice(0, 3);
  types.forEach((t, i) => {
    const top = r2 + 32 + i * 31,
      bx = M + 12,
      bw = halfW - 24;
    const detail = `${t.occupied}/${t.total} · ${clp(t.average_rate)} prom.`;
    text(fit(t.room_type, bw - width(detail, 8) - 10, 8.5, B), bx, top, 8.5, B);
    textR(detail, bx + bw, top, 8, R, C.ink2);
    round(bx, top + 13, bw, 7, 3.5, C.track);
    bar(bx, top + 13, t.total ? bw * (t.occupied / t.total) : 0, 7, C.blue, "right");
  });
  if (m.by_type.length > 3)
    text(`+${m.by_type.length - 3} tipo(s) más; detalle en el ERP`, M + 12, r2 + r2H - 14, 7, R, C.muted);

  const px = M + halfW + gap;
  card(px, r2, halfW, r2H, "Ingresos por medio de pago", clp(closing.total_received));
  const byMethod = m.payments_by_method;
  const fixed: ClosingPaymentMethod[] = ["transfer", "cash", "card", "airbnb"];
  const others = (["booking", "company", "other"] as ClosingPaymentMethod[]).reduce((s, k) => s + Number(byMethod[k] ?? 0), 0);
  const methods = [
    ...fixed.map((k) => ({ key: k, label: closingPaymentLabels[k], amount: Number(byMethod[k] ?? 0) })),
    { key: "others", label: "Otros", amount: others },
  ].filter((x) => x.amount > 0);
  const positiveTotal = methods.reduce((s, x) => s + x.amount, 0);
  const sx = px + 12,
    sw = halfW - 24,
    st = r2 + 32;
  if (!positiveTotal) {
    round(sx, st, sw, 14, 4, C.track);
    text("Sin ingresos registrados en el día", sx, st + 26, 8.5, R, C.ink2);
  } else {
    let cursor = sx;
    methods.forEach((x, i) => {
      const w = sw * (x.amount / positiveTotal);
      const first = i === 0,
        last = i === methods.length - 1;
      // 2px de separación entre segmentos; solo los extremos de la barra van redondeados.
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
      page.drawSvgPath(path, { x: cursor, y: Y(st), color: methodColor[x.key] });
      cursor += w;
    });
    methods.forEach((x, i) => {
      const top = st + 24 + i * (methods.length > 4 ? 13.5 : 16.5);
      round(sx, top + 1, 8, 8, 2, methodColor[x.key]);
      text(x.label, sx + 14, top, 8.5);
      textR(clp(x.amount), sx + sw - 38, top, 8.5, B);
      textR(pct((x.amount / positiveTotal) * 100), sx + sw, top, 8, R, C.ink2);
    });
  }

  // ---------- Tendencia 7 días ----------
  const r3 = r2 + r2H + 12,
    r3H = 150;
  card(M, r3, W - 2 * M, r3H, "Ingreso últimos 7 días", "Ocupación bajo cada día");
  const cw = W - 2 * M - 24,
    chartTop = r3 + 36,
    chartH = 76,
    base = chartTop + chartH;
  const incomes = ctx.week.map((d) => d.income ?? 0);
  const max = Math.max(...incomes, 1);
  const slot = cw / 7,
    colW = Math.min(34, slot * 0.5);
  for (const g of [0.5, 1]) {
    page.drawLine({
      start: { x: M + 12, y: Y(base - chartH * g) },
      end: { x: M + 12 + cw, y: Y(base - chartH * g) },
      thickness: 0.4,
      color: C.line,
      dashArray: [2, 2],
    });
    text(short(max * g), M + 14, base - chartH * g - 10, 6.5, R, C.muted);
  }
  page.drawLine({ start: { x: M + 12, y: Y(base) }, end: { x: M + 12 + cw, y: Y(base) }, thickness: 0.7, color: C.muted });
  const peak = Math.max(...incomes);
  ctx.week.forEach((d, i) => {
    const x = M + 12 + slot * i + (slot - colW) / 2;
    const today = i === 6;
    if (d.income === null) {
      textC("sin cierre", x + colW / 2, base - 12, 6.5, R, C.muted);
    } else {
      const h = Math.max(0, (d.income / max) * chartH);
      bar(x, base - h, colW, h, today ? C.blue : C.blueSoft, "up");
      if (today || (d.income === peak && peak > 0)) textC(short(d.income), x + colW / 2, base - h - 11, 7.5, B);
    }
    textC(d.label, x + colW / 2, base + 6, 7.5, today ? B : R, today ? C.ink : C.ink2);
    textC(d.occupancy === null ? "-" : pct(d.occupancy), x + colW / 2, base + 17, 7, R, C.muted);
  });

  // ---------- Mes a la fecha ----------
  const r4 = r3 + r3H + 12,
    r4H = 64,
    mo = ctx.month;
  card(M, r4, W - 2 * M, r4H, `${mo.name} a la fecha`);
  const tiles: [string, string, string][] = [
    [
      "Ingreso acumulado",
      clp(mo.income),
      mo.previousIncome
        ? `${mo.income >= mo.previousIncome ? "+" : ""}${pct((mo.income / mo.previousIncome - 1) * 100)} vs ${mo.previousName} al mismo día`
        : `Sin cierres de ${mo.previousName} para comparar`,
    ],
    ["Gasto acumulado", clp(mo.expense), mo.income ? `${pct((mo.expense / mo.income) * 100, 1)} del ingreso` : "-"],
    [
      "Ocupación promedio",
      pct(mo.occupancy, 1),
      `${mo.availablePerDay.toLocaleString("es-CL", { maximumFractionDigits: 1 })} hab. libres por día`,
    ],
    [
      "Días con cierre",
      `${mo.closedDays}/${mo.elapsedDays}`,
      mo.elapsedDays - mo.closedDays > 0
        ? `${mo.elapsedDays - mo.closedDays} día(s) sin cierre emitido`
        : "Todos los días cerrados",
    ],
  ];
  const mw = (W - 2 * M - 24) / 4;
  tiles.forEach(([label, value, hint], i) => {
    const x = M + 12 + i * mw;
    if (i)
      page.drawLine({ start: { x: x - 6, y: Y(r4 + 26) }, end: { x: x - 6, y: Y(r4 + r4H - 10) }, thickness: 0.5, color: C.line });
    text(label, x, r4 + 26, 7.5, R, C.ink2);
    text(value, x, r4 + 37, 12.5, B);
    text(fit(hint, mw - 10, 6.5), x, r4 + 53, 6.5, R, C.muted);
  });

  // ---------- Control del día | Observaciones ----------
  const alerts: Alert[] = [];
  if (closing.pending_amount > 0) {
    const rooms = m.pending
      .slice(0, 3)
      .map((p) => `${p.room} ${clp(p.balance)}`)
      .join(" · ");
    alerts.push({ level: "warning", title: `Saldo pendiente de cobro ${clp(closing.pending_amount)}`, detail: rooms });
  } else alerts.push({ level: "good", title: "Sin saldos pendientes de cobro", detail: "Todas las estadías en curso están pagadas" });
  if (closing.reported_problems)
    alerts.push({ level: "serious", title: "Problema reportado", detail: closing.reported_problems });
  else alerts.push({ level: "good", title: "Sin problemas reportados", detail: "Recepción no informó incidencias" });
  if (closing.items_to_replenish) alerts.push({ level: "warning", title: "Reponer", detail: closing.items_to_replenish });
  if (m.reservations_without_price > 0)
    alerts.push({
      level: "warning",
      title: `${m.reservations_without_price} reserva(s) activa(s) sin precio`,
      detail: "Cárgales el monto para que la venta promedio sea correcta",
    });
  else alerts.push({ level: "good", title: "Todas las reservas activas tienen precio", detail: "0 reservas en $0" });

  const r5 = r4 + r4H + 12,
    r5H = 172;
  card(M, r5, halfW, r5H, "Control del día");
  alerts.slice(0, 5).forEach((a, i) => {
    const top = r5 + 30 + i * 28,
      x = M + 12;
    const color = { good: C.good, warning: C.warning, serious: C.serious, critical: C.critical }[a.level];
    page.drawCircle({ x: x + 7, y: Y(top + 7), size: 7, color });
    // Ícono además del color: check para "bien", signo de exclamación para el resto.
    if (a.level === "good")
      page.drawSvgPath("M -3 0 L -1 2.5 L 3.5 -2.5", { x: x + 7, y: Y(top + 7), borderColor: C.white, borderWidth: 1.4 });
    else {
      page.drawRectangle({ x: x + 6.3, y: Y(top + 9), width: 1.4, height: 5, color: C.white });
      page.drawRectangle({ x: x + 6.3, y: Y(top + 12), width: 1.4, height: 1.4, color: C.white });
    }
    text(fit(a.title, halfW - 44, 8.5, B), x + 20, top, 8.5, B);
    text(fit(a.detail, halfW - 44, 7.5), x + 20, top + 12, 7.5, R, C.ink2);
  });

  const ox = M + halfW + gap;
  card(ox, r5, halfW, r5H, "Observaciones generales");
  const lines = closing.observations ? wrap(closing.observations, halfW - 24, 8.5) : ["Sin observaciones."];
  const maxLines = Math.floor((r5H - 40) / 12.5);
  const shown = lines.length > maxLines ? [...lines.slice(0, maxLines - 1), "(texto completo en el ERP)"] : lines;
  shown.forEach((l, i) =>
    text(l, ox + 12, r5 + 30 + i * 12.5, 8.5, R, closing.observations && i < lines.length ? C.ink : C.muted),
  );

  // ---------- Pie ----------
  const stamp = closing.issued_at
    ? `Emitido el ${new Date(closing.issued_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}${input.issuedBy ? ` por ${input.issuedBy}` : ""}`
    : `Borrador del ${formatClosingDate(closing.closing_date)}, no emitido`;
  text(stamp, M, H - 28, 7, R, C.muted);
  textR("OASIS ERP", W - M, H - 28, 7, B, C.muted);
}
