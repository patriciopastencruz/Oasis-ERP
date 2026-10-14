import { addDays } from "./daily-closing";

/**
 * Reporte semanal de los hostales: piezas puras (sin base de datos) para los
 * cierres pendientes y los saldos por cobrar.
 */

/**
 * Días del rango sin cierre diario emitido. El día de hoy no cuenta como
 * pendiente: recepción lo cierra al terminar el turno.
 */
export function pendingClosingDates(from: string, to: string, issued: Iterable<string>, today: string) {
  const done = new Set(issued);
  const last = to < today ? to : addDays(today, -1);
  const out: string[] = [];
  for (let d = from; d <= last; d = addDays(d, 1)) if (!done.has(d)) out.push(d);
  return out;
}

export type BalanceReservation = {
  id: string;
  room: string;
  guest: string | null;
  check_in: string;
  check_out: string;
  total_value: number;
  postpaid_company: boolean;
  payments: { amount: number; type: string; status: string }[];
};

/** Reservas con saldo por cobrar (pagos confirmados, devoluciones restan), mayor saldo primero. */
export function pendingBalances(reservations: BalanceReservation[]) {
  const rows = reservations
    .map((r) => {
      const paid = r.payments
        .filter((p) => p.status === "confirmed")
        .reduce((s, p) => s + (p.type === "refund" ? -p.amount : p.amount), 0);
      return { ...r, paid, balance: r.total_value - paid };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.check_in.localeCompare(b.check_in));
  return {
    total: rows.reduce((s, r) => s + r.balance, 0),
    postpaid: rows.filter((r) => r.postpaid_company).reduce((s, r) => s + r.balance, 0),
    rows,
  };
}
