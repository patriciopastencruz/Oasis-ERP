/** Comprobantes que podrían estar repetidos: mismo número de operación o mismo archivo en más de un pago. */

export type DuplicateMatch = {
  payment_id: string;
  reservation_id: string;
  same_reservation: boolean;
  paid_at: string;
  amount: number;
  unit_code: string | null;
  room: string | null;
  guest: string | null;
};

export type DuplicateHit = {
  kind: "receipt" | "file";
  /** Lo que suman los pagos que citan el mismo comprobante. */
  groupTotal: number;
  /** Monto que leyó la IA en el comprobante; null si no se pudo leer. */
  receiptAmount: number | null;
  /** Los pagos que comparten el comprobante son de reservas con fechas de llegada distintas. */
  datesDiffer: boolean;
  matches: DuplicateMatch[];
};

export type DuplicateRow = {
  payment_id: string;
  reservation_id: string;
  kind: string;
  group_total: number | string | null;
  receipt_amount: number | string | null;
  dates_differ?: boolean | null;
  matches: unknown;
};

export const DUPLICATE_KIND_LABELS = {
  receipt: "Mismo comprobante (monto, fecha y hora)",
  file: "Mismo archivo",
} as const;

/** Agrupa las filas de la consulta por reserva. */
export function groupDuplicatesByReservation(rows: DuplicateRow[] | null | undefined) {
  const byReservation = new Map<string, DuplicateHit[]>();
  for (const row of rows ?? []) {
    if (row.kind !== "receipt" && row.kind !== "file") continue;
    const matches = ((row.matches ?? []) as DuplicateMatch[]).map((m) => ({ ...m, amount: Number(m.amount) }));
    if (!matches.length) continue;
    const hit: DuplicateHit = {
      kind: row.kind,
      groupTotal: Number(row.group_total ?? 0),
      receiptAmount: row.receipt_amount === null || row.receipt_amount === undefined ? null : Number(row.receipt_amount),
      datesDiffer: Boolean(row.dates_differ),
      matches,
    };
    byReservation.set(row.reservation_id, [...(byReservation.get(row.reservation_id) ?? []), hit]);
  }
  return byReservation;
}

/** Frase corta para mostrar bajo el aviso: qué se repite y con quién. */
export function describeDuplicate(hit: DuplicateHit) {
  const others = hit.matches.map((m) => {
    const who = m.guest ?? "huésped sin nombre";
    const where = [m.unit_code, m.room].filter(Boolean).join(" · ");
    return `${who}${where ? ` (${where})` : ""}${m.same_reservation ? ", misma reserva" : ""}`;
  });
  const unique = [...new Set(others)];
  const shown = unique.slice(0, 3).join("; ") + (unique.length > 3 ? ` y ${unique.length - 3} más` : "");
  return `${DUPLICATE_KIND_LABELS[hit.kind]} que ${shown}${hit.datesDiffer ? ", pero de una reserva con otras fechas" : ""}`;
}
