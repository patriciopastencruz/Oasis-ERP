import Link from "next/link";
import { BedDouble, LogIn, LogOut, WalletCards, Plus } from "lucide-react";
import { WeeklyCalendar } from "@/components/lodging/weekly-calendar";
import { SyncButton } from "@/components/lodging/sync-button";
import { calendarData } from "@/modules/lodging/application/queries";

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}
function monday(value: string) {
  const d = new Date(`${value}T12:00:00Z`),
    day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
function add(value: string, n: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function Page() {
  const today = localDate(),
    start = monday(today);
  const data = await calendarData(add(start, -21), add(start, 28));
  const todayReservations = data.reservations.filter(
    (r) =>
      r.check_in <= today &&
      r.check_out > today &&
      !["cancelled", "conflict"].includes(r.status),
  );
  const cards = [
    ["Habitaciones ocupadas hoy", todayReservations.length, BedDouble],
    [
      "Habitaciones disponibles hoy",
      Math.max(
        0,
        data.rooms.filter(
          (r) => r.status !== "out_of_service" && r.status !== "maintenance",
        ).length - todayReservations.length,
      ),
      BedDouble,
    ],
    [
      "Llegadas de hoy",
      data.reservations.filter((r) => r.check_in === today).length,
      LogIn,
    ],
    [
      "Salidas de hoy",
      data.reservations.filter((r) => r.check_out === today).length,
      LogOut,
    ],
    [
      "Pagos pendientes",
      data.reservations.filter((r) => Number(r.total_value) > 0).length,
      WalletCards,
    ],
  ] as const;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#277a55]">
            Hostal Uruguay
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Calendario de reservas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Disponibilidad semanal, llegadas, salidas y pagos en un solo lugar.
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/lodging/reservations/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#277a55] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            Nueva reserva
          </Link>
          <SyncButton unitId={data.unit.id} />
        </div>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([title, value, Icon]) => (
          <div
            key={title}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_3px_12px_rgba(15,23,42,.025)]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[#277a55]">
              <Icon size={15} />
            </span>
            <span className="min-w-0">
              <b className="block text-lg leading-none text-slate-800">
                {value}
              </b>
              <span className="mt-1 block truncate text-[10px] leading-tight text-slate-500">
                {title}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mb-2 text-right text-[10px] text-slate-400">
        Última actualización:{" "}
        {data.lastSync
          ? new Intl.DateTimeFormat("es-CL", {
              timeZone: "America/Santiago",
              dateStyle: "short",
              timeStyle: "short",
              hour12: false,
            }).format(new Date(data.lastSync))
          : "Sin actualizaciones"}
      </p>
      <WeeklyCalendar
        rooms={data.rooms}
        reservations={data.reservations}
        initialMonday={start}
      />
    </>
  );
}
