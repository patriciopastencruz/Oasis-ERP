import { addDays, clp, formatClosingDate, pct, type PeriodKind } from "./daily-closing";
import { percentChange, type RangeOperations } from "./monthly-closing";

export type PeriodClosingInput = {
  closing_date: string;
  total_received: number;
  expense_total: number;
  pending_amount: number;
  reported_problems: string | null;
  items_to_replenish: string | null;
  metrics: {
    arrivals?: number;
    guests?: number;
    reservations_without_price?: number;
    pending?: { room: string; balance: number }[];
  } | null;
};
export type PeriodExpenseInput = { category_name: string | null; amount: number };

const weekdayShort = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const periodDayLabel = (day: string) => `${weekdayShort[weekday(day)]} ${Number(day.slice(8))}`;

/** Consolida operación (reservas y pagos) con los cierres diarios emitidos del período. */
export function buildPeriodReport(input: {
  kind: PeriodKind;
  range: { start: string; end: string };
  ops: RangeOperations;
  previousOps: RangeOperations | null;
  closings: PeriodClosingInput[];
  expenses: PeriodExpenseInput[];
}) {
  const { ops, previousOps: prev, closings, range } = input;
  const sorted = [...closings].sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  const income = ops.received;
  const expenseTotal = sorted.reduce((s, c) => s + Number(c.expense_total), 0);
  const result = income - expenseTotal;
  const days = ops.days.map((d) => ({
    ...d,
    label: periodDayLabel(d.date),
    occupancy: ops.totalRooms ? d.occupied / ops.totalRooms : 0,
  }));
  const withIncome = days.filter((d) => d.received > 0);
  const best = withIncome.reduce<(typeof days)[number] | null>((a, d) => (!a || d.received > a.received ? d : a), null);
  const worst = withIncome.reduce<(typeof days)[number] | null>((a, d) => (!a || d.received < a.received ? d : a), null);
  const nightsOf = (filter: (d: (typeof days)[number]) => boolean) => {
    const ds = days.filter(filter);
    return ds.length && ops.totalRooms ? ds.reduce((s, d) => s + d.occupied, 0) / (ds.length * ops.totalRooms) : null;
  };
  // Noches de viernes y sábado frente al resto.
  const weekendOcc = nightsOf((d) => [5, 6].includes(weekday(d.date)));
  const weekdayOcc = nightsOf((d) => ![5, 6].includes(weekday(d.date)));
  const topType = [...ops.types].sort((a, b) => b.occ - a.occ)[0] ?? null;

  const byCategory = new Map<string, number>();
  for (const e of input.expenses) {
    const key = e.category_name ?? "Sin categoría";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(e.amount));
  }
  const expenseCategories = [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  const closedDates = new Set(sorted.map((c) => c.closing_date));
  const missingDates: string[] = [];
  for (let d = range.start; d <= ops.end; d = addDays(d, 1)) if (!closedDates.has(d)) missingDates.push(d);
  const last = sorted.at(-1) ?? null;
  const problems = sorted.filter((c) => c.reported_problems).map((c) => ({ date: c.closing_date, text: c.reported_problems! }));
  const replenish = [...sorted].reverse().find((c) => c.items_to_replenish)?.items_to_replenish ?? null;
  const withoutPrice = last?.metrics?.reservations_without_price ?? 0;
  const pendingRooms = (last?.metrics?.pending ?? []).slice().sort((a, b) => b.balance - a.balance);
  const arrivals = sorted.reduce((s, c) => s + Number(c.metrics?.arrivals ?? 0), 0);

  const deltas = {
    income: percentChange(income, prev?.received ?? null),
    occupancyPts: prev ? (ops.occupancy - prev.occupancy) * 100 : null,
    adr: percentChange(ops.adr, prev?.adr ?? null),
    revpar: percentChange(ops.revpar, prev?.revpar ?? null),
  };
  const label = input.kind === "week" ? "de la semana" : "de la quincena";
  const previousName = input.kind === "week" ? "la semana anterior" : "la quincena anterior";
  const conclusions: string[] = [];
  if (deltas.income !== null)
    conclusions.push(
      `Se cobraron ${clp(income)}, ${deltas.income >= 0 ? "+" : ""}${pct(deltas.income)} frente a ${previousName}, con ${pct(ops.occupancy * 100)} de ocupación.`,
    );
  else conclusions.push(`Se cobraron ${clp(income)} con ${pct(ops.occupancy * 100)} de ocupación.`);
  if (weekendOcc !== null && weekdayOcc !== null)
    conclusions.push(
      `Viernes y sábado ocupan ${pct(weekendOcc * 100)} frente a ${pct(weekdayOcc * 100)} el resto de los días${
        weekendOcc - weekdayOcc > 0.1 ? ": hay espacio para promociones entre semana" : ""
      }.`,
    );
  if (ops.rooms.length > 1) {
    const low = [...ops.rooms].sort((a, b) => a.occ - b.occ)[0];
    conclusions.push(`${ops.rooms[0].name} fue la habitación que más vendió (${clp(ops.rooms[0].revenue)}); ${low.name} tuvo la menor ocupación (${pct(low.occ * 100)}).`);
  }
  if (expenseCategories[0])
    conclusions.push(`Los gastos ${label} suman ${clp(expenseTotal)}; la mayor partida es ${expenseCategories[0].name} (${clp(expenseCategories[0].amount)}).`);

  return {
    kind: input.kind,
    range,
    ops,
    income,
    expenseTotal,
    result,
    margin: income ? (result / income) * 100 : null,
    deltas,
    days,
    best,
    worst,
    weekendOcc,
    weekdayOcc,
    topType,
    expenseCategories,
    closedDays: sorted.length,
    missingDates,
    pendingAtEnd: Number(last?.pending_amount ?? 0),
    pendingRooms,
    problems,
    replenish,
    withoutPrice,
    arrivals,
    conclusions,
    rangeLabel: `${formatClosingDate(range.start)} al ${formatClosingDate(range.end)}`,
  };
}
export type PeriodReport = ReturnType<typeof buildPeriodReport>;
