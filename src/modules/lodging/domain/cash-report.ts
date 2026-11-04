/** Detalle del efectivo cobrado en un hostal durante un mes (pagos confirmados con medio "efectivo"). */
export type CashPaymentRow = {
  id: string;
  paid_at: string;
  type: string;
  amount: number;
  notes: string | null;
  room: string | null;
  guest: string | null;
  origin: string | null;
  registered_by: string | null;
};

export type CashEntry = {
  id: string;
  /** Día en Santiago (AAAA-MM-DD). */
  day: string;
  time: string;
  type: string;
  /** Con signo: los reembolsos restan. */
  amount: number;
  notes: string | null;
  room: string | null;
  guest: string | null;
  origin: string | null;
  registeredBy: string | null;
};

export type CashDay = { day: string; entries: CashEntry[]; total: number };

export type CashReport = {
  month: string;
  days: CashDay[];
  /** Cobrado menos reembolsos en efectivo. */
  total: number;
  collected: number;
  refunded: number;
  count: number;
  /** Pagos en efectivo anulados: no suman, pero se informan para control. */
  voidedCount: number;
  voidedTotal: number;
};

export const CASH_TYPE_LABELS: Record<string, string> = {
  deposit: "Abono",
  partial: "Pago parcial",
  total: "Pago total",
  check_in: "Pago al llegar",
  check_out: "Pago al salir",
  guarantee: "Garantía",
  refund: "Reembolso",
};

const santiagoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" });
const santiagoTime = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false });

/** Primer día del mes y primer día del mes siguiente (formato AAAA-MM-DD). */
export function cashMonthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, toExclusive: `${next}-01` };
}

export function buildCashReport(month: string, confirmed: CashPaymentRow[], voided: { amount: number }[] = []): CashReport {
  const { from, toExclusive } = cashMonthRange(month);
  const entries: CashEntry[] = confirmed
    .map((p) => {
      const when = new Date(p.paid_at);
      return {
        id: p.id,
        day: santiagoDay.format(when),
        time: santiagoTime.format(when),
        type: p.type,
        amount: p.type === "refund" ? -Number(p.amount) : Number(p.amount),
        notes: p.notes,
        room: p.room,
        guest: p.guest,
        origin: p.origin,
        registeredBy: p.registered_by,
      };
    })
    // El filtro de la consulta lleva margen por la diferencia horaria; el exacto es por fecha de Santiago.
    .filter((e) => e.day >= from && e.day < toExclusive)
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));

  const byDay = new Map<string, CashEntry[]>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const days = [...byDay.entries()].map(([day, list]) => ({ day, entries: list, total: list.reduce((s, e) => s + e.amount, 0) }));

  const collected = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const refunded = entries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  return {
    month,
    days,
    total: collected - refunded,
    collected,
    refunded,
    count: entries.length,
    voidedCount: voided.length,
    voidedTotal: voided.reduce((s, v) => s + Number(v.amount), 0),
  };
}
