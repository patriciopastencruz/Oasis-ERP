import { addDays, clp, pct, santiagoToday } from "./daily-closing";

export type FinanceSection = "income" | "fixed" | "variable" | "investment" | "withdrawal" | "other";

export const sectionLabels: Record<FinanceSection, string> = {
  income: "Ingresos",
  fixed: "Costos fijos",
  variable: "Costos variables",
  investment: "Inversión",
  withdrawal: "Retiros",
  other: "Otros gastos",
};
export const costSections: FinanceSection[] = ["fixed", "variable", "investment", "withdrawal", "other"];
export const sectionOrder: FinanceSection[] = ["income", ...costSections];

export type FinanceCategory = { id: string; section: FinanceSection; name: string; sort_order: number; active: boolean };

export type MonthlySummary = {
  period: string;
  days: number;
  lodging_income: { total: number; by_method: Record<string, number> };
  commissions: { amount: number; category_id: string | null };
  daily_expenses: { category_id: string | null; name: string; section: FinanceSection; amount: number; lines: number }[];
  lines: {
    id: string;
    category_id: string;
    category: string;
    section: FinanceSection;
    description: string;
    amount: number;
    payer: string | null;
    payment_status: "pagado" | "pendiente";
  }[];
  categories: FinanceCategory[];
  totals: Record<FinanceSection | "costs" | "profit", number>;
  pending: { count: number; amount: number };
  daily_closings: { issued: number };
};

export type StatementItem = {
  kind: "auto" | "line";
  label: string;
  amount: number;
  source: "reservas" | "diario" | "manual";
  lineId?: string;
  payer?: string | null;
  status?: "pagado" | "pendiente";
  detail?: string;
};
export type StatementGroup = { id: string; name: string; total: number; items: StatementItem[] };
export type StatementSection = { key: FinanceSection; name: string; total: number; groups: StatementGroup[] };

/** Arma el estado de resultados: secciones → categorías → partidas automáticas y manuales. */
export function buildStatement(summary: MonthlySummary): StatementSection[] {
  const groups = new Map<string, StatementGroup & { section: FinanceSection; order: number }>();
  const group = (id: string, name: string, section: FinanceSection, order = 999) => {
    const key = `${section}:${id}`;
    if (!groups.has(key)) groups.set(key, { id, name, section, total: 0, items: [], order });
    return groups.get(key)!;
  };
  const order = new Map(summary.categories.map((c) => [c.id, c.sort_order]));
  const add = (g: StatementGroup, item: StatementItem) => {
    g.items.push(item);
    g.total += Number(item.amount);
  };
  add(group("lodging", "Venta hospedaje", "income", 0), {
    kind: "auto",
    label: "Pagos recibidos de reservas",
    amount: Number(summary.lodging_income.total),
    source: "reservas",
  });
  if (Number(summary.commissions.amount) > 0) {
    const id = summary.commissions.category_id ?? "commissions";
    add(group(id, "Comisiones plataformas", "variable", order.get(id) ?? 10), {
      kind: "auto",
      label: "Comisiones de reservas del mes",
      amount: Number(summary.commissions.amount),
      source: "reservas",
    });
  }
  for (const d of summary.daily_expenses) {
    const id = d.category_id ?? "uncategorized";
    add(group(id, d.name, d.section, order.get(id) ?? 999), {
      kind: "auto",
      label: `Gastos de cierres diarios (${d.lines})`,
      amount: Number(d.amount),
      source: "diario",
    });
  }
  for (const l of summary.lines) {
    add(group(l.category_id, l.category, l.section, order.get(l.category_id) ?? 999), {
      kind: "line",
      label: l.description,
      amount: Number(l.amount),
      source: "manual",
      lineId: l.id,
      payer: l.payer,
      status: l.payment_status,
    });
  }
  return sectionOrder.map((key) => {
    const sectionGroups = [...groups.values()].filter((g) => g.section === key).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return {
      key,
      name: sectionLabels[key],
      total: Number(summary.totals[key] ?? 0),
      groups: sectionGroups.map(({ id, name, total, items }) => ({ id, name, total, items })),
    };
  });
}

// ---------------------------------------------------------------------------
// Operación del mes a partir de reservas, habitaciones y pagos.

export type OpsRoom = { id: string; name: string; room_type: string; display_order: number };
export type OpsReservation = { room_id: string; check_in: string; check_out: string; total_value: number };
export type OpsPayment = { paid_at: string; amount: number; payment_method: string };

const santiagoDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => addDays(`${nextMonth(month)}-01`, -1);
export function nextMonth(month: string) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}
export function previousMonth(month: string) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabel = (month: string) => `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export const monthName = (month: string) => monthNames[Number(month.slice(5, 7)) - 1];

export function monthOperations(
  month: string,
  rooms: OpsRoom[],
  reservations: OpsReservation[],
  payments: OpsPayment[],
  today = santiagoToday(),
) {
  const start = monthStart(month);
  const end = monthEnd(month) < today ? monthEnd(month) : today;
  const roomIds = new Set(rooms.map((r) => r.id));
  const stays = reservations
    .filter((r) => roomIds.has(r.room_id))
    .map((r) => {
      const nights = Math.max(1, Math.round((Date.parse(`${r.check_out}T12:00:00Z`) - Date.parse(`${r.check_in}T12:00:00Z`)) / 86_400_000));
      return { ...r, perNight: Number(r.total_value) / nights };
    });
  const receivedByDay = new Map<string, number>();
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const day = santiagoDate(p.paid_at);
    if (day < start || day > monthEnd(month)) continue;
    receivedByDay.set(day, (receivedByDay.get(day) ?? 0) + Number(p.amount));
    byMethod[p.payment_method] = (byMethod[p.payment_method] ?? 0) + Number(p.amount);
  }
  const perRoom = new Map(rooms.map((r) => [r.id, { ...r, nights: 0, revenue: 0 }]));
  const days: { date: string; occupied: number; revenue: number; received: number }[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const active = stays.filter((s) => s.check_in <= day && s.check_out > day);
    const occupiedRooms = new Set<string>();
    let revenue = 0;
    for (const s of active) {
      revenue += s.perNight;
      const room = perRoom.get(s.room_id)!;
      room.revenue += s.perNight;
      if (!occupiedRooms.has(s.room_id)) room.nights += 1;
      occupiedRooms.add(s.room_id);
    }
    days.push({ date: day, occupied: occupiedRooms.size, revenue, received: receivedByDay.get(day) ?? 0 });
  }
  const totalRooms = rooms.length;
  const roomNights = totalRooms * days.length;
  const nightsSold = days.reduce((s, d) => s + d.occupied, 0);
  const revenue = days.reduce((s, d) => s + d.revenue, 0);
  const received = [...receivedByDay.values()].reduce((s, v) => s + v, 0);
  const rows = [...perRoom.values()]
    .map((r) => ({
      name: r.name,
      type: r.room_type,
      nights: r.nights,
      revenue: r.revenue,
      occ: days.length ? r.nights / days.length : 0,
      adr: r.nights ? r.revenue / r.nights : 0,
      order: r.display_order,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.order - b.order);
  const typeMap = new Map<string, { type: string; rooms: number; nights: number; revenue: number }>();
  for (const r of rows) {
    const t = typeMap.get(r.type) ?? { type: r.type, rooms: 0, nights: 0, revenue: 0 };
    t.rooms += 1;
    t.nights += r.nights;
    t.revenue += r.revenue;
    typeMap.set(r.type, t);
  }
  const types = [...typeMap.values()].map((t) => ({
    ...t,
    occ: days.length && t.rooms ? t.nights / (t.rooms * days.length) : 0,
    adr: t.nights ? t.revenue / t.nights : 0,
  }));
  const weekdayOcc = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const ds = days.filter((d) => weekday(d.date) === wd);
    return { weekday: wd, occ: ds.length && totalRooms ? ds.reduce((s, d) => s + d.occupied, 0) / (ds.length * totalRooms) : null };
  });
  const weeks: { start: string; end: string; days: number; received: number; occ: number; adr: number; revpar: number }[] = [];
  let chunk: typeof days = [];
  const flush = () => {
    if (!chunk.length) return;
    const n = chunk.reduce((s, d) => s + d.occupied, 0), rev = chunk.reduce((s, d) => s + d.revenue, 0);
    weeks.push({
      start: chunk[0].date,
      end: chunk.at(-1)!.date,
      days: chunk.length,
      received: chunk.reduce((s, d) => s + d.received, 0),
      occ: totalRooms ? n / (totalRooms * chunk.length) : 0,
      adr: n ? rev / n : 0,
      revpar: totalRooms ? rev / (totalRooms * chunk.length) : 0,
    });
    chunk = [];
  };
  for (const d of days) {
    if (weekday(d.date) === 1) flush();
    chunk.push(d);
  }
  flush();
  return {
    month,
    elapsedDays: days.length,
    totalRooms,
    nightsSold,
    occupancy: roomNights ? nightsSold / roomNights : 0,
    revenue,
    adr: nightsSold ? revenue / nightsSold : 0,
    revpar: roomNights ? revenue / roomNights : 0,
    received,
    byMethod,
    days,
    rooms: rows,
    types,
    weekdayOcc,
    weeks,
  };
}
export type MonthOperations = ReturnType<typeof monthOperations>;

/** Punto de equilibrio: noches y ocupación necesarias para cubrir los costos fijos. */
export function breakEven(summary: MonthlySummary, ops: MonthOperations) {
  const income = Number(summary.totals.income);
  const variableRate = income ? Number(summary.totals.variable) / income : 0;
  const contribution = ops.adr * (1 - variableRate);
  const nights = contribution > 0 ? Number(summary.totals.fixed) / contribution : null;
  const capacity = ops.totalRooms * ops.elapsedDays;
  return { nights, occupancy: nights !== null && capacity ? nights / capacity : null };
}

const change = (now: number, before: number | null | undefined) =>
  before ? ((now - before) / Math.abs(before)) * 100 : null;

/** Conclusiones automáticas en lenguaje simple (reglas fijas sobre los números). */
export function monthlyConclusions(
  summary: MonthlySummary,
  ops: MonthOperations,
  previous: { summary: MonthlySummary | null; ops: MonthOperations | null },
  statement: StatementSection[],
) {
  const out: string[] = [];
  const t = summary.totals;
  const income = Number(t.income);
  const margin = income ? (Number(t.profit) / income) * 100 : 0;
  const profitChange = change(Number(t.profit), previous.summary ? Number(previous.summary.totals.profit) : null);
  out.push(
    `La utilidad fue ${clp(t.profit)} (margen ${pct(margin)})${
      profitChange === null ? "" : `, ${profitChange >= 0 ? "+" : ""}${pct(profitChange)} frente a ${monthName(previousMonth(ops.month))}`
    }.`,
  );
  const be = breakEven(summary, ops);
  if (be.occupancy !== null && ops.totalRooms)
    out.push(
      `Ocupación ${pct(ops.occupancy * 100)}: ${Math.abs(Math.round((ops.occupancy - be.occupancy) * 100))} puntos ${
        ops.occupancy >= be.occupancy ? "sobre" : "bajo"
      } el punto de equilibrio (${pct(be.occupancy * 100)}).`,
    );
  const costGroups = statement
    .filter((s) => s.key === "fixed" || s.key === "variable")
    .flatMap((s) => s.groups)
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);
  if (costGroups[0] && income)
    out.push(`${costGroups[0].name} es el mayor costo: ${clp(costGroups[0].total)} (${pct((costGroups[0].total / income) * 100)} del ingreso).`);
  if (ops.rooms.length > 1) {
    const best = ops.rooms[0];
    const low = [...ops.rooms].sort((a, b) => a.occ - b.occ)[0];
    out.push(`${best.name} lideró la venta (${clp(best.revenue)}); ${low.name} tuvo la menor ocupación (${pct(low.occ * 100)}).`);
  }
  out.push(
    summary.pending.count
      ? `Quedan ${summary.pending.count} pago(s) pendiente(s) por ${clp(summary.pending.amount)}.`
      : "Todos los gastos registrados del mes están pagados.",
  );
  return out;
}

export { change as percentChange };
