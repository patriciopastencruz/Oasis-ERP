import Link from "next/link";
import { TrendingUp, BedDouble, Wallet, PieChart, Tag, Gauge, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { redirect } from "next/navigation";
import { LodgingReportTabs } from "@/components/lodging/report-tabs";
import { WeeklyHostelsPdfForm } from "@/components/lodging/weekly-hostels-pdf-form";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";
import { rangeOperations } from "@/modules/lodging/domain/monthly-closing";
import { averageStay, cancellationStats, futureOccupancy } from "@/modules/lodging/domain/report-indicators";

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
  const { ctx, unit, supabase } = await lodgingContext([
    "lodging.reservations.view",
    "lodging.closings.reports",
  ]);
  // Quien solo ve reportes de cierres entra directo a esa pestaña.
  if (!ctx.permissions.has("lodging.reservations.view")) redirect("/lodging/closing/reports");
  const todayIso = todayInSantiago();
  const selectedIso = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayIso;
  const monthStartIso = `${selectedIso.slice(0, 7)}-01`;
  const prevIso = addDays(selectedIso, -1);
  const nextIso = addDays(selectedIso, 1);

  const [{ data: rooms }, { data: reservations }, { data: payments }, { data: upcoming }, { data: monthStays }] =
    await Promise.all([
      supabase
        .from("lodging_rooms")
        .select("id,name,room_type,display_order,status")
        .eq("business_unit_id", unit.id)
        .eq("active", true),
      supabase
        .from("lodging_reservations")
        .select("room_id,check_in,check_out,total_value")
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
      // Reservas de los próximos 30 días desde hoy (independiente del día elegido).
      supabase
        .from("lodging_reservations")
        .select("room_id,check_in,check_out")
        .eq("business_unit_id", unit.id)
        .not("status", "in", '("cancelled","conflict")')
        .lt("check_in", addDays(todayIso, 30))
        .gt("check_out", todayIso),
      // Todas las reservas del mes (también canceladas) y sus vecinas, para
      // medir cancelaciones y detectar si la noche se volvió a vender.
      supabase
        .from("lodging_reservations")
        .select("room_id,check_in,check_out,status,origin,total_value")
        .eq("business_unit_id", unit.id)
        .gt("check_out", addDays(monthStartIso, -7))
        .lte("check_in", addDays(selectedIso, 60)),
    ]);

  // Precio promedio de la habitación (ADR) acumulado del mes: venta devengada
  // por noche dividida por las noches vendidas, considerando todas las
  // habitaciones activas (también las que hoy estén en mantención).
  const monthOps = rangeOperations(
    monthStartIso,
    selectedIso,
    (rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      room_type: r.room_type,
      display_order: r.display_order ?? 0,
    })),
    (reservations ?? []).map((r) => ({
      room_id: r.room_id,
      check_in: r.check_in,
      check_out: r.check_out,
      total_value: Number(r.total_value ?? 0),
    })),
    [],
    selectedIso,
  );

  const sellableRooms = (rooms ?? []).filter(
    (r) => r.status !== "maintenance" && r.status !== "out_of_service",
  );
  const totalRooms = sellableRooms.length;
  const sellableIds = new Set(sellableRooms.map((r) => r.id));

  // Días transcurridos del mes seleccionado (del 1 al día elegido, inclusive).
  const days: string[] = [];
  for (let d = monthStartIso; d <= selectedIso; d = addDays(d, 1)) days.push(d);

  // Cada reserva activa cuenta como una ocupación: si la persona que pagó no
  // llegó y la habitación se revendió, ambas cuentan y el % puede superar 100.
  const occupiedByDay = new Map<string, number>(days.map((d) => [d, 0]));
  for (const r of reservations ?? []) {
    if (!sellableIds.has(r.room_id)) continue;
    let d = r.check_in < monthStartIso ? monthStartIso : r.check_in;
    while (d < r.check_out && d <= selectedIso) {
      if (occupiedByDay.has(d)) occupiedByDay.set(d, (occupiedByDay.get(d) ?? 0) + 1);
      d = addDays(d, 1);
    }
  }
  const occupiedCount = (d: string) => occupiedByDay.get(d) ?? 0;
  const occupancyRates = days.map((d) =>
    totalRooms ? occupiedCount(d) / totalRooms : 0,
  );
  const avgOccupancyPct = days.length
    ? Math.round(
        (occupancyRates.reduce((a, b) => a + b, 0) / days.length) * 100,
      )
    : 0;

  const occupiedSelected = occupiedCount(selectedIso);
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

  const stay = averageStay(reservations ?? [], monthStartIso, selectedIso);
  const future = futureOccupancy(upcoming ?? [], sellableIds, todayIso, [7, 15, 30]);
  const cancellations = cancellationStats(
    (monthStays ?? []).map((r) => ({ ...r, total_value: Number(r.total_value ?? 0) })),
    monthStartIso,
    selectedIso,
  );
  const cancellationRows = cancellations.byOrigin
    .filter((r) => r.cancelled > 0 || r.reservations > 0)
    .sort((a, b) => originOrder.indexOf(a.origin) - originOrder.indexOf(b.origin));
  const roomRows = [...monthOps.rooms].sort((a, b) => a.order - b.order);

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
    [
      `Precio promedio acumulado de ${monthLabel(selectedIso)}`,
      clp.format(Math.round(monthOps.adr)),
      Tag,
      `Por noche vendida · ${monthOps.nightsSold} noches, todas las habitaciones`,
    ],
    [
      `RevPAR acumulado de ${monthLabel(selectedIso)}`,
      clp.format(Math.round(monthOps.revpar)),
      Gauge,
      "Venta por habitación disponible al día (precio × ocupación)",
    ],
    [
      `Estadía promedio de ${monthLabel(selectedIso)}`,
      stay.average === null
        ? "—"
        : `${stay.average.toLocaleString("es-CL", { maximumFractionDigits: 1 })} noches`,
      CalendarClock,
      `${stay.reservations} reservas con llegada en el mes`,
    ],
  ] as const;

  return (
    <>
      <LodgingReportTabs active="reservations" permissions={ctx.permissions} />
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
      {ctx.permissions.has("lodging.closings.reports") && (
        <div className="mt-3 flex justify-end">
          <WeeklyHostelsPdfForm />
        </div>
      )}
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
      <Panel className="mt-5">
        <h2 className="font-semibold">Ocupación futura</h2>
        <p className="mt-1 text-xs text-slate-500">
          Noches ya reservadas desde hoy sobre las habitaciones disponibles para vender.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {future.map((f) => (
            <div key={f.days} className="rounded-xl border border-[#e5eaf0] p-3">
              <span className="text-xs text-slate-500">Próximos {f.days} días</span>
              <b className="mt-1 block text-2xl leading-none text-slate-800">
                {Math.round(f.pct * 100)}%
              </b>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#0b4f9c]"
                  style={{ width: `${Math.min(100, Math.round(f.pct * 100))}%` }}
                />
              </div>
              <span className="mt-1.5 block text-[11px] text-slate-400">
                {f.nights} de {f.available} noches
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="mt-5 overflow-x-auto">
        <h2 className="font-semibold">
          Precio promedio y ocupación por habitación — {monthLabel(selectedIso)}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Del 1 del mes hasta {label.toLowerCase()}. El precio promedio es la venta por noche vendida de esa habitación.
        </p>
        <table className="mt-4 w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-2">Habitación</th>
              <th className="px-2">Tipo</th>
              <th className="px-2 text-right">Noches vendidas</th>
              <th className="px-2 text-right">Ocupación</th>
              <th className="pl-2 text-right">Precio promedio</th>
            </tr>
          </thead>
          <tbody>
            {roomRows.map((r) => (
              <tr key={r.name} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium text-slate-800">{r.name}</td>
                <td className="px-2 text-slate-500">{r.type}</td>
                <td className="px-2 text-right">{r.nights}</td>
                <td className="px-2 text-right">{Math.round(r.occ * 100)}%</td>
                <td className="pl-2 text-right font-semibold text-slate-800">
                  {r.nights ? clp.format(Math.round(r.adr)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold text-slate-800">
              <td className="py-2 pr-2">Todas</td>
              <td className="px-2" />
              <td className="px-2 text-right">{monthOps.nightsSold}</td>
              <td className="px-2 text-right">{Math.round(monthOps.occupancy * 100)}%</td>
              <td className="pl-2 text-right">{clp.format(Math.round(monthOps.adr))}</td>
            </tr>
          </tfoot>
        </table>
      </Panel>
      <Panel className="mt-5 overflow-x-auto">
        <h2 className="font-semibold">Cancelaciones — {monthLabel(selectedIso)}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Reservas con llegada del 1 del mes hasta {label.toLowerCase()}. Una cancelada cuya habitación se volvió a vender en esas fechas no cuenta como noche perdida.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#e5eaf0] p-3">
            <span className="text-xs text-slate-500">Tasa de cancelación</span>
            <b className="mt-1 block text-2xl leading-none text-slate-800">
              {(cancellations.rate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%
            </b>
            <span className="mt-1.5 block text-[11px] text-slate-400">
              {cancellations.cancelled} de {cancellations.reservations} reservas
            </span>
          </div>
          <div className="rounded-xl border border-[#e5eaf0] p-3">
            <span className="text-xs text-slate-500">Noches perdidas</span>
            <b className="mt-1 block text-2xl leading-none text-slate-800">
              {cancellations.lostNights}
            </b>
            <span className="mt-1.5 block text-[11px] text-slate-400">
              {cancellations.replaced} canceladas se volvieron a vender
            </span>
          </div>
          <div className="rounded-xl border border-[#e5eaf0] p-3">
            <span className="text-xs text-slate-500">Venta registrada de esas noches</span>
            <b className="mt-1 block text-2xl leading-none text-slate-800">
              {clp.format(cancellations.lostValue)}
            </b>
            <span className="mt-1.5 block text-[11px] text-slate-400">
              Las importadas de Airbnb/Booking suelen venir sin precio
            </span>
          </div>
        </div>
        <table className="mt-4 w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-2">Canal</th>
              <th className="px-2 text-right">Reservas</th>
              <th className="px-2 text-right">Canceladas</th>
              <th className="px-2 text-right">Tasa</th>
              <th className="pl-2 text-right">Noches perdidas</th>
            </tr>
          </thead>
          <tbody>
            {cancellationRows.map((r) => (
              <tr key={r.origin} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium text-slate-800">
                  {originLabels[r.origin] ?? r.origin}
                </td>
                <td className="px-2 text-right">{r.reservations}</td>
                <td className="px-2 text-right">{r.cancelled}</td>
                <td className="px-2 text-right">
                  {r.reservations ? Math.round((r.cancelled / r.reservations) * 100) : 0}%
                </td>
                <td className="pl-2 text-right font-semibold text-slate-800">{r.lostNights}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
