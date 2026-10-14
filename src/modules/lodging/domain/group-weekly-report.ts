import { addDays } from "./daily-closing";

/**
 * Reporte semanal de los hostales: piezas puras (sin base de datos) para los
 * cierres pendientes, los saldos por cobrar y la gestión de cada recepcionista.
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

export type StaffActivity = {
  userId: string;
  name: string;
  reservations: number;
  payments: number;
  collected: number;
  closings: number;
};

/**
 * Gestión de recepción en la semana: reservas ingresadas, pagos registrados
 * (monto neto) y cierres diarios emitidos por persona. Orden por actividad.
 */
export function staffActivity(input: {
  names: Map<string, string>;
  reservations: { created_by: string | null }[];
  payments: { registered_by: string | null; amount: number; type: string }[];
  closings: { issued_by: string | null }[];
}) {
  const map = new Map<string, StaffActivity>();
  const get = (id: string) => {
    let row = map.get(id);
    if (!row) {
      row = { userId: id, name: input.names.get(id) ?? "Usuario", reservations: 0, payments: 0, collected: 0, closings: 0 };
      map.set(id, row);
    }
    return row;
  };
  for (const r of input.reservations) if (r.created_by) get(r.created_by).reservations += 1;
  for (const p of input.payments)
    if (p.registered_by) {
      const row = get(p.registered_by);
      row.payments += 1;
      row.collected += p.type === "refund" ? -p.amount : p.amount;
    }
  for (const c of input.closings) if (c.issued_by) get(c.issued_by).closings += 1;
  return [...map.values()].sort(
    (a, b) => b.reservations + b.payments + b.closings - (a.reservations + a.payments + a.closings) || a.name.localeCompare(b.name),
  );
}
