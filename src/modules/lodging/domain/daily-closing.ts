export const closingPaymentLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  airbnb: "Airbnb",
  booking: "Booking",
  company: "Empresa",
  other: "Otro",
} as const;
export type ClosingPaymentMethod = keyof typeof closingPaymentLabels;

export const expenseMethodLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
} as const;
export type ExpenseMethod = keyof typeof expenseMethodLabels;

export const paymentTypeLabels: Record<string, string> = {
  deposit: "Abono",
  partial: "Pago parcial",
  total: "Pago total",
  check_in: "Pago check-in",
  check_out: "Pago check-out",
  guarantee: "Garantía",
  refund: "Reembolso",
};

export type ClosingMetrics = {
  date: string;
  total_rooms: number;
  occupied_rooms: number;
  available_rooms: number;
  occupancy_pct: number;
  day_revenue: number;
  average_rate: number;
  guests: number;
  arrivals: number;
  departures: number;
  reservations_without_price: number;
  by_type: { room_type: string; total: number; occupied: number; average_rate: number }[];
  payments_by_method: Record<ClosingPaymentMethod, number>;
  total_received: number;
  payments: {
    room: string;
    guest: string | null;
    method: ClosingPaymentMethod;
    type: string;
    amount: number;
    paid_at: string;
  }[];
  pending_amount: number;
  pending: {
    room: string;
    guest: string | null;
    check_in: string;
    check_out: string;
    total: number;
    paid: number;
    balance: number;
    postpaid_company: boolean;
  }[];
};

export type ClosingExpense = {
  description: string;
  amount: number;
  payment_method: ExpenseMethod;
  category_id?: string | null;
  category_name?: string | null;
};

/** Cierre persistido, tal como lo usan la vista previa, el PDF y los reportes. */
export type DailyClosing = {
  id: string;
  closing_date: string;
  status: "draft" | "issued";
  metrics: ClosingMetrics;
  total_rooms: number;
  occupied_rooms: number;
  occupancy_pct: number;
  average_rate: number;
  cash_received: number;
  transfer_received: number;
  card_received: number;
  airbnb_received: number;
  other_received: number;
  total_received: number;
  pending_amount: number;
  expense_total: number;
  net_result: number;
  reported_problems: string | null;
  items_to_replenish: string | null;
  observations: string | null;
  issued_at: string | null;
  email_sent_at: string | null;
  email_recipients: string[] | null;
};

export const clp = (value: number) => {
  const n = Math.round(Number(value) || 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("es-CL")}`;
};
export const pct = (value: number) =>
  `${(Number(value) || 0).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function santiagoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(now);
}

export function addDays(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** DD-MM-AAAA, como en el reporte manual. */
export function formatClosingDate(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}-${m}-${y}`;
}

export function isValidDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type PeriodKind = "week" | "fortnight" | "month";
export const periodLabels: Record<PeriodKind, string> = {
  week: "Semanal",
  fortnight: "Quincenal",
  month: "Mensual",
};

/** Rango (inclusive) del período que contiene la fecha de referencia. */
export function periodRange(kind: PeriodKind, reference: string) {
  const [y, m, d] = reference.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const monthStart = `${reference.slice(0, 7)}-01`;
  if (kind === "week") {
    const weekday = new Date(`${reference}T12:00:00Z`).getUTCDay() || 7;
    const start = addDays(reference, 1 - weekday);
    return { start, end: addDays(start, 6) };
  }
  if (kind === "fortnight")
    return d <= 15
      ? { start: monthStart, end: `${reference.slice(0, 7)}-15` }
      : { start: `${reference.slice(0, 7)}-16`, end: monthEnd };
  return { start: monthStart, end: monthEnd };
}

export function shiftPeriod(kind: PeriodKind, reference: string, delta: number) {
  const { start, end } = periodRange(kind, reference);
  return delta < 0 ? addDays(start, -1) : addDays(end, 1);
}

export function daysBetween(start: string, end: string) {
  return (
    Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1
  );
}

export type ClosingHistoryRow = {
  closing_date: string;
  total_received: number;
  expense_total: number;
  occupied_rooms: number;
  total_rooms: number;
};

const weekdayShort = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const weekdayLong = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const longDayLabel = (day: string) => `${weekdayLong[weekday(day)]} ${formatClosingDate(day)}`;
export const shortDayLabel = (day: string) => `${weekdayShort[weekday(day)]} ${Number(day.slice(8))}`;
export const monthName = (day: string) => monthNames[Number(day.slice(5, 7)) - 1];

/**
 * Contexto de la hoja ejecutiva: los 7 días terminados en la fecha del
 * cierre, el mes a la fecha y el mes anterior al mismo día. `previous` son
 * cierres emitidos anteriores a la fecha; el cierre actual se suma aparte.
 */
export function executiveContext(current: ClosingHistoryRow, previous: ClosingHistoryRow[]) {
  const date = current.closing_date;
  const byDate = new Map(previous.filter((r) => r.closing_date < date).map((r) => [r.closing_date, r]));
  byDate.set(date, current);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(date, i - 6);
    const row = byDate.get(day);
    return {
      date: day,
      label: shortDayLabel(day),
      income: row ? Number(row.total_received) : null,
      occupancy: row && row.total_rooms ? (row.occupied_rooms * 100) / row.total_rooms : null,
    };
  });
  const prior = week.slice(0, 6).filter((d) => d.income !== null);
  const priorAverage = prior.length ? prior.reduce((s, d) => s + (d.income ?? 0), 0) / prior.length : null;

  const monthRows = [...byDate.values()].filter((r) => r.closing_date.slice(0, 7) === date.slice(0, 7));
  const sum = (rows: ClosingHistoryRow[], key: keyof ClosingHistoryRow) =>
    rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const roomNights = sum(monthRows, "total_rooms");
  const dayOfMonth = Number(date.slice(8));
  const previousMonthDay = addDays(`${date.slice(0, 7)}-01`, -1);
  const previousCutoff = `${previousMonthDay.slice(0, 7)}-${String(Math.min(dayOfMonth, Number(previousMonthDay.slice(8)))).padStart(2, "0")}`;
  const previousMonthRows = [...byDate.values()].filter(
    (r) => r.closing_date.slice(0, 7) === previousMonthDay.slice(0, 7) && r.closing_date <= previousCutoff,
  );
  return {
    week,
    priorAverage,
    change: priorAverage ? ((Number(current.total_received) - priorAverage) / priorAverage) * 100 : null,
    month: {
      name: monthName(date),
      income: sum(monthRows, "total_received"),
      expense: sum(monthRows, "expense_total"),
      occupancy: roomNights ? (sum(monthRows, "occupied_rooms") * 100) / roomNights : 0,
      availablePerDay: monthRows.length ? (roomNights - sum(monthRows, "occupied_rooms")) / monthRows.length : 0,
      closedDays: monthRows.length,
      elapsedDays: dayOfMonth,
      previousName: monthName(previousMonthDay),
      previousIncome: previousMonthRows.length ? sum(previousMonthRows, "total_received") : null,
    },
  };
}

/** Desde qué fecha cargar cierres para `executiveContext`. */
export const executiveHistoryStart = (date: string) => {
  const previousMonthStart = `${addDays(`${date.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
  const weekStart = addDays(date, -6);
  return previousMonthStart < weekStart ? previousMonthStart : weekStart;
};
