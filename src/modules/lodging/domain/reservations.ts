export type Payment = {
  amount: number;
  type:
    | "deposit"
    | "partial"
    | "total"
    | "check_in"
    | "check_out"
    | "guarantee"
    | "refund";
  status: "confirmed" | "pending" | "voided" | "refunded";
};

export function nights(checkIn: string, checkOut: string) {
  const start = Date.parse(`${checkIn}T12:00:00Z`);
  const end = Date.parse(`${checkOut}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error("La salida debe ser posterior a la entrada.");
  return Math.round((end - start) / 86_400_000);
}

export function totalForStay(input: {
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  discount?: number;
  surcharge?: number;
}) {
  const value =
    nights(input.checkIn, input.checkOut) * input.nightlyRate -
    (input.discount ?? 0) +
    (input.surcharge ?? 0);
  if (value < 0) throw new Error("El total no puede ser negativo.");
  return value;
}

export function overlaps(aIn: string, aOut: string, bIn: string, bOut: string) {
  return aIn < bOut && aOut > bIn;
}

export function paymentSummary(total: number, payments: Payment[]) {
  const confirmed = payments.filter((p) => p.status === "confirmed");
  const refunds = confirmed
    .filter((p) => p.type === "refund")
    .reduce((sum, p) => sum + p.amount, 0);
  const paid = confirmed
    .filter((p) => p.type !== "refund")
    .reduce((sum, p) => sum + p.amount, 0);
  const net = paid - refunds;
  const status =
    refunds > 0 && net === 0
      ? "Reembolsado totalmente"
      : refunds > 0
        ? "Reembolsado parcialmente"
        : net === 0
          ? "Pendiente"
          : net < total
            ? "Pago parcial"
            : net === total
              ? "Pagado"
              : "Pago excedido";
  return { paid: net, balance: total - net, status };
}

export type IcalEvent = {
  uid: string;
  start: string;
  end: string;
  summary: string;
  status: string;
  recurrenceId: string;
};

function unfold(ics: string) {
  return ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function dateValue(value: string) {
  const raw = value.split(":").slice(1).join(":");
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) throw new Error("Fecha iCal inválida");
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseIcal(ics: string): IcalEvent[] {
  if (!ics.includes("BEGIN:VCALENDAR"))
    throw new Error("Calendario iCal inválido");
  const events: IcalEvent[] = [];
  let block: string[] | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") block = [];
    else if (line === "END:VEVENT" && block) {
      const find = (key: string) => block!.find((x) => x.startsWith(key));
      const uid = find("UID:")?.slice(4).trim();
      const start = find("DTSTART");
      const end = find("DTEND");
      if (uid && start && end)
        events.push({
          uid,
          start: dateValue(start),
          end: dateValue(end),
          summary: find("SUMMARY:")?.slice(8).trim() || "No disponible",
          status: find("STATUS:")?.slice(7).trim().toUpperCase() || "CONFIRMED",
          recurrenceId:
            find("RECURRENCE-ID")?.split(":").slice(1).join(":") || "",
        });
      block = null;
    } else if (block) block.push(line);
  }
  return events;
}

const compactDate = (date: string) => date.replaceAll("-", "");
const escapeIcal = (value: string) =>
  value.replace(/[\\;,\n]/g, (x) => `\\${x === "\n" ? "n" : x}`);

export function generateIcal(
  roomCode: string,
  reservations: { id: string; check_in: string; check_out: string }[],
) {
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oasis ERP//Oasis Reservas//ES",
    "CALSCALE:GREGORIAN",
    ...reservations.flatMap((r) => [
      "BEGIN:VEVENT",
      `UID:${escapeIcal(r.id)}@oasis-reservas`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compactDate(r.check_in)}`,
      `DTEND;VALUE=DATE:${compactDate(r.check_out)}`,
      "STATUS:CONFIRMED",
      "SUMMARY:No disponible",
      `LOCATION:${escapeIcal(roomCode)}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
