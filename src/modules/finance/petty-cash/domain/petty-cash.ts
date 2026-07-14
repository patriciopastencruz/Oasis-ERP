export const PETTY_CASH_WEEKLY_LIMIT = 100_000;

export const pettyCashStatuses = [
  "draft",
  "submitted",
  "under_review",
  "correction_requested",
  "resubmitted",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const documentTypes = [
  ["receipt", "Boleta"],
  ["invoice", "Factura"],
  ["voucher", "Recibo"],
  ["electronic_receipt", "Comprobante electrónico"],
  ["other", "Otro"],
] as const;

export function chileWeek(date = new Date()) {
  const local = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) + "T12:00:00",
  );
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  const end = new Date(local);
  end.setDate(end.getDate() + 6);
  return { start: isoDate(local), end: isoDate(end) };
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatWeek(start: string, end?: string) {
  const from = new Date(`${start}T12:00:00`);
  const to = end
    ? new Date(`${end}T12:00:00`)
    : new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 12);
  const formatter = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  });
  return `${formatter.format(from)} al ${formatter.format(to)}`;
}

export function clp(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function availableBalance(limit: number, committed: number) {
  return Math.max(0, limit - committed);
}
