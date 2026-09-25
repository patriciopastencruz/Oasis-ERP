export type CashFlowKind = "income" | "expense";

export const paymentMethods = {
  cash: "Efectivo",
  transfer: "Transferencia",
  debit_card: "Tarjeta de débito",
  credit_card: "Tarjeta de crédito",
  check: "Cheque",
  other: "Otro",
} as const;
export type PaymentMethod = keyof typeof paymentMethods;

export const kindLabels: Record<CashFlowKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
};

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export type CashFlowEntry = {
  id: string;
  entry_date: string;
  kind: CashFlowKind;
  amount: number;
  payment_method: PaymentMethod;
  category_id: string;
  category_name: string;
};

export type CashFlowClosing = {
  closing_date: string;
  status: "closed" | "reopened";
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoMonth = /^\d{4}-\d{2}$/;

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de operación. */
export function chileToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Valida una fecha recibida por URL; si no es válida o es futura, usa hoy. */
export function resolveDay(value: string | undefined, today = chileToday()) {
  if (!value || !isoDate.test(value)) return today;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return today;
  return value > today ? today : value;
}

export function resolveMonth(value: string | undefined, today = chileToday()) {
  const current = today.slice(0, 7);
  if (!value || !isoMonth.test(value)) return current;
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) return current;
  return value > current ? current : value;
}

export function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function shiftMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

/** Primer y último día (inclusive) de un mes YYYY-MM. */
export function monthRange(month: string) {
  const start = `${month}-01`;
  const end = shiftDay(`${shiftMonth(month, 1)}-01`, -1);
  return { start, end };
}

export function formatDay(day: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    ...(options ?? { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  }).format(new Date(`${day}T12:00:00Z`));
}

export function formatMonth(month: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

export function totalsOf(entries: Pick<CashFlowEntry, "kind" | "amount">[]) {
  const income = entries
    .filter((entry) => entry.kind === "income")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = entries
    .filter((entry) => entry.kind === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  return { income, expense, net: income - expense };
}

export type MonthDay = {
  date: string;
  income: number;
  expense: number;
  net: number;
  entries: number;
  status: "closed" | "reopened" | "open";
};

export type CategoryTotal = {
  category_id: string;
  name: string;
  kind: CashFlowKind;
  amount: number;
  share: number;
};

/**
 * Consolida los movimientos vigentes de un mes: totales, detalle diario
 * (hasta hoy si es el mes en curso) y participación por categoría y medio.
 */
export function summarizeMonth(
  month: string,
  entries: CashFlowEntry[],
  closings: CashFlowClosing[],
  today = chileToday(),
) {
  const { start, end } = monthRange(month);
  const last = end < today ? end : today;
  const closingByDay = new Map(closings.map((c) => [c.closing_date, c.status]));
  const days: MonthDay[] = [];
  for (let day = start; day <= last; day = shiftDay(day, 1)) {
    const dayEntries = entries.filter((entry) => entry.entry_date === day);
    const totals = totalsOf(dayEntries);
    days.push({
      date: day,
      ...totals,
      entries: dayEntries.length,
      status: closingByDay.get(day) ?? "open",
    });
  }

  const totals = totalsOf(entries);
  const categoryMap = new Map<string, CategoryTotal>();
  for (const entry of entries) {
    const current = categoryMap.get(entry.category_id) ?? {
      category_id: entry.category_id,
      name: entry.category_name,
      kind: entry.kind,
      amount: 0,
      share: 0,
    };
    current.amount += Number(entry.amount);
    categoryMap.set(entry.category_id, current);
  }
  const categories = [...categoryMap.values()]
    .map((category) => {
      const base = category.kind === "income" ? totals.income : totals.expense;
      return { ...category, share: base ? category.amount / base : 0 };
    })
    .sort((a, b) => b.amount - a.amount);

  const methods = (Object.keys(paymentMethods) as PaymentMethod[])
    .map((method) => {
      const methodEntries = entries.filter((e) => e.payment_method === method);
      return { method, label: paymentMethods[method], ...totalsOf(methodEntries) };
    })
    .filter((row) => row.income || row.expense);

  return {
    totals: {
      ...totals,
      margin: totals.income ? totals.net / totals.income : null,
    },
    days,
    closedDays: days.filter((d) => d.status === "closed").length,
    pendingDays: days.filter((d) => d.status !== "closed" && d.entries > 0).length,
    incomeCategories: categories.filter((c) => c.kind === "income"),
    expenseCategories: categories.filter((c) => c.kind === "expense"),
    methods,
  };
}
