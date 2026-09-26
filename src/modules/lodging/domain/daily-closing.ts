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

export const clp = (value: number) =>
  `$${Math.round(Number(value) || 0).toLocaleString("es-CL")}`;
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

type PeriodClosing = Pick<
  DailyClosing,
  | "closing_date"
  | "total_rooms"
  | "occupied_rooms"
  | "occupancy_pct"
  | "cash_received"
  | "transfer_received"
  | "card_received"
  | "airbnb_received"
  | "other_received"
  | "total_received"
  | "expense_total"
  | "net_result"
  | "pending_amount"
> & { metrics?: Pick<ClosingMetrics, "day_revenue"> | null };

/**
 * Consolida cierres emitidos de un período. La ocupación promedio se pondera
 * por habitaciones-noche disponibles (no promedia porcentajes) y la venta
 * promedio es la venta devengada dividida por las habitaciones ocupadas.
 */
export function summarizePeriod<T extends PeriodClosing>(
  closings: T[],
  range: { start: string; end: string },
  today = santiagoToday(),
) {
  const sorted = [...closings].sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  const sum = (key: keyof PeriodClosing) =>
    sorted.reduce((total, c) => total + Number(c[key] ?? 0), 0);
  const roomNights = sum("total_rooms");
  const occupiedNights = sum("occupied_rooms");
  const revenue = sorted.reduce((t, c) => t + Number(c.metrics?.day_revenue ?? 0), 0);
  const lastDay = range.end < today ? range.end : today;
  const elapsedDays = range.start > lastDay ? 0 : daysBetween(range.start, lastDay);
  const closedDates = new Set(sorted.map((c) => c.closing_date));
  const missingDates: string[] = [];
  for (let day = range.start; day <= lastDay; day = addDays(day, 1))
    if (!closedDates.has(day)) missingDates.push(day);
  return {
    closedDays: sorted.length,
    elapsedDays,
    missingDates,
    totalReceived: sum("total_received"),
    byMethod: {
      cash: sum("cash_received"),
      transfer: sum("transfer_received"),
      card: sum("card_received"),
      airbnb: sum("airbnb_received"),
      other: sum("other_received"),
    },
    expenseTotal: sum("expense_total"),
    netResult: sum("net_result"),
    occupancyPct: roomNights ? (occupiedNights * 100) / roomNights : 0,
    averageAvailableRooms: sorted.length ? (roomNights - occupiedNights) / sorted.length : 0,
    averageOccupiedRooms: sorted.length ? occupiedNights / sorted.length : 0,
    averageRate: occupiedNights ? revenue / occupiedNights : 0,
    averageDailyIncome: sorted.length ? sum("total_received") / sorted.length : 0,
    lastPending: sorted.at(-1)?.pending_amount ?? 0,
    days: sorted,
  };
}
