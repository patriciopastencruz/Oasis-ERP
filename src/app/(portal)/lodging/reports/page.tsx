import Link from "next/link";
import { TrendingUp, BedDouble, Wallet, PieChart, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";

function todayInSantiago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}
function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function santiagoDateOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}
function monthLabel(iso: string) {
  const label = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function dayLabel(iso: string, todayIso: string) {
  if (iso === todayIso) return "Hoy";
  if (iso === addDays(todayIso, -1)) return "Ayer";
  if (iso === addDays(todayIso, 1)) return "Mañana";
  const formatted = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

const originLabels: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking",
  direct: "Directa",
  whatsapp: "WhatsApp",
  company: "Empresa",
  public_web: "Sitio web",
  other: "Otro",
};
// Orden fijo pedido: Airbnb, Booking, Directa primero; el resto solo si
// tiene movimiento ese mes.
const originOrder = ["airbnb", "booking", "direct", "whatsapp", "company", "public_web", "other"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await lodgingContext();
  const todayIso = todayInSantiago();
  const selectedIso = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayIso;
  const monthStartIso = `${selectedIso.slice(0, 7)}-01`;
  const prevIso = addDays(selectedIso, -1);
  const nextIso = addDays(selectedIso, 1);

  const [{ data: rooms }, { data: reservations }, { data: payments }] =
    await Promise.all([
      supabase
        .from("lodging_rooms")
        .select("id,status")
        .eq("business_unit_id", unit.id)
        .eq("active", true),
      supabase
        .from("lodging_reservations")
        .select("room_id,check_in,check_out")
        .eq("business_unit_id", unit.id)
        .not("status", "in", '("cancelled","conflict")')
        .lt("check_in", addDays(selectedIso, 1))
        .gt("check_out", monthStartIso),
      supabase
        .from("lodging_reservation_payments")
        .select("amount,type,status,paid_at,lodging_reservations(origin)")
        .eq("business_unit_id", unit.id)
        .eq("status", "confirmed")
        .gte("paid_at", `${addDays(monthStartIso, -1)}T00:00:00Z`)
        .lt("paid_at", `${addDays(selectedIso, 1)}T00:00:00Z`),
    ]);

  const sellableRooms = (rooms ?? []).filter(
    (r) => r.status !== "maintenance" && r.status !== "out_of_service",
  );
  const totalRooms = sellableRooms.length;
  const sellableIds = new Set(sellableRooms.map((r) => r.id));

  // Días transcurridos del mes seleccionado (del 1 al día elegido, inclusive).
  const days: string[] = [];
  for (let d = monthStartIso; d <= selectedIso; d = addDays(d, 1)) days.push(d);

  const occupiedByDay = new Map<string, Set<string>>(
    days.map((d) => [d, new Set<string>()]),
  );
  for (const r of reservations ?? []) {
    if (!sellableIds.has(r.room_id)) continue;
    let d = r.check_in < monthStartIso ? monthStartIso : r.check_in;
    while (d < r.check_out && d <= selectedIso) {
      occupiedByDay.get(d)?.add(r.room_id);
      d = addDays(d, 1);
    }
  }
  const occupancyRates = days.map((d) =>
    totalRooms ? (occupiedByDay.get(d)?.size ?? 0) / totalRooms : 0,
  );
  const avgOccupancyPct = days.length
    ? Math.round(
        (occupancyRates.reduce((a, b) => a + b, 0) / days.length) * 100,
      )
    : 0;

  const occupiedSelected = occupiedByDay.get(selectedIso)?.size ?? 0;
  const occupancyPctSelected = totalRooms
    ? Math.round((occupiedSelected / totalRooms) * 100)
    : 0;

  let selectedIncome = 0;
  let monthIncome = 0;
  const byOrigin = new Map<string, number>();
  for (const p of payments ?? []) {
    const day = santiagoDateOf(p.paid_at);
    if (day < monthStartIso || day > selectedIso) continue;
    const signed = p.type === "refund" ? -Number(p.amount) : Number(p.amount);
    monthIncome += signed;
    if (day === selectedIso) selectedIncome += signed;
    const reservation = Array.isArray(p.lodging_reservations)
      ? p.lodging_reservations[0]
      : p.lodging_reservations;
    const origin = reservation?.origin ?? "other";
    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + signed);
  }
  const breakdown = originOrder
    .filter((o) => originOrder.indexOf(o) < 3 || (byOrigin.get(o) ?? 0) !== 0)
    .map((origin) => ({
      origin,
      label: originLabels[origin] ?? origin,
      amount: byOrigin.get(origin) ?? 0,
    }));

  const label = dayLabel(selectedIso, todayIso);
  const cards = [
    [`Ingreso recibido — ${label}`, clp.format(selectedIncome), Wallet, null],
    [
      `Ocupación — ${label}`,
      `${occupancyPctSelected}%`,
      BedDouble,
      `${occupiedSelected} de ${totalRooms} habitaciones`,
    ],
    [
      `Ocupación acumulada de ${monthLabel(selectedIso)}`,
      `${avgOccupancyPct}%`,
      PieChart,
      "Promedio diario del mes",
    ],
    [
      `Ingreso acumulado de ${monthLabel(selectedIso)}`,
      clp.format(monthIncome),
      TrendingUp,
      null,
    ],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Reportabilidad"
          description="Ingreso del día, disponibilidad de habitaciones y acumulado del mes por canal."
        />
        <div className="flex items-center gap-2 rounded-xl border border-[#d9dfe6] bg-white px-2 py-1.5 shadow-[0_3px_12px_rgba(15,23,42,.03)]">
          <Link
            href={`/lodging/reports?date=${prevIso}`}
            className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-50"
            aria-label="Día anterior"
          >
            <ChevronLeft size={18} />
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-slate-800">
            {label}
          </span>
          <Link
            href={`/lodging/reports?date=${nextIso}`}
            className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-50"
            aria-label="Día siguiente"
          >
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>
      <div className="mb-5 mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, value, Icon, sub]) => (
          <div
            key={title}
            className="rounded-2xl border border-[#d9dfe6] bg-white p-4 shadow-[0_10px_30px_rgba(20,57,39,.04)]"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-[#0b4f9c]">
              <Icon size={17} />
            </span>
            <b className="mt-3 block text-2xl leading-none text-slate-800">
              {value}
            </b>
            <span className="mt-1.5 block text-xs leading-tight text-slate-500">
              {title}
            </span>
            {sub && (
              <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">
                {sub}
              </span>
            )}
          </div>
        ))}
      </div>
      <Panel>
        <h2 className="font-semibold">
          Desglose del ingreso de {monthLabel(selectedIso)} por canal
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Suma de pagos confirmados desde el 1 del mes hasta {label.toLowerCase()}, netos de reembolsos.
        </p>
        <div className="mt-4 space-y-2">
          {breakdown.map(({ origin, label: originName, amount }) => {
            const pct =
              monthIncome > 0 ? Math.round((amount / monthIncome) * 100) : 0;
            return (
              <div key={origin} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 font-medium text-slate-700">
                  {originName}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#0b4f9c]"
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-semibold text-slate-800">
                  {clp.format(amount)}
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-slate-400">
                  {pct}%
                </span>
              </div>
            );
          })}
          {monthIncome === 0 && (
            <p className="text-sm text-slate-500">
              Aún no hay ingresos registrados en este rango.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
