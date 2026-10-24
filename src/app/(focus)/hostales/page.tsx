import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { WeeklyCalendar } from "@/components/lodging/weekly-calendar";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadGroupWeeklyReport } from "@/modules/lodging/application/group-weekly-queries";
import { clp, unitCalendarData } from "@/modules/lodging/application/queries";
import { addDays, defaultClosingDate, santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { revparGoal } from "@/modules/lodging/domain/report-goals";

export const dynamic = "force-dynamic";

// Se agrega a la pantalla de inicio del celular como app propia («Oasis Hostales»).
export const metadata: Metadata = {
  title: "Oasis Hostales",
  manifest: "/hostales.webmanifest",
  appleWebApp: { capable: true, title: "Oasis Hostales", statusBarStyle: "default" },
  icons: { icon: "/ops-icon-192.png", apple: "/ops-icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#0b4f9c", width: "device-width", initialScale: 1 };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Vista para el celular del dueño: indicadores del mes de los 3 hostales y el
 * calendario de cada uno (solo lectura). Usa el mismo cálculo que /kpis.
 */
export default async function HostalesPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const q = await searchParams;
  const ctx = await requirePermission("kpis.view");
  const units = lodgingUnitCodes
    .map((code) => ctx.units.find((u) => u.code === code))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));
  if (!units.length) return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No tienes hostales asignados.</p>;

  const today = santiagoToday();
  const current = units.find((u) => u.code === q.h) ?? units[0];
  const supabase = await createSupabaseServerClient();
  const [report, calendar] = await Promise.all([
    loadGroupWeeklyReport(supabase, units, today, defaultClosingDate()),
    unitCalendarData(supabase, current.id, addDays(today, -21), addDays(today, 28)),
  ]);

  const rows = report.hostels.map((h) => ({ unit: h.unit, m: h.month, goals: h.goals }));
  const sum = (pick: (m: (typeof rows)[number]["m"]) => number) => rows.reduce((s, r) => s + pick(r.m), 0);
  const roomNights = sum((m) => m.roomNights);
  const soldNights = sum((m) => m.soldNights);
  const total = {
    occupancy: roomNights ? sum((m) => m.nightsSold) / roomNights : 0,
    adr: soldNights ? sum((m) => m.soldRevenue) / soldNights : 0,
    revpar: roomNights ? sum((m) => m.revenue) / roomNights : 0,
    revenue: sum((m) => m.revenue),
  };
  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "America/Santiago" }).format(new Date(`${today}T12:00:00Z`));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--oasis-primary)]">Hostales Oasis</p>
        <h1 className="text-2xl font-bold">Ocupación y calendario</h1>
        <p className="text-sm text-slate-500">
          Acumulado de {monthLabel}, del 1 al {Number(today.slice(8))}. Para actualizar, vuelve a abrir la página.
        </p>
      </header>

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-[13px] tabular-nums">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Hostal</th>
              <th className="px-2 py-2 text-right">Ocupación</th>
              <th className="px-2 py-2 text-right">Tarifa</th>
              <th className="px-2 py-2 text-right">RevPAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ unit, m, goals }) => (
              <tr key={unit.id} className="border-t">
                <td className="px-2 py-2 font-semibold">{unit.name.replace(/^Hostal\s+/i, "")}</td>
                <Metric value={pct(m.occupancy)} goal={goals.occupancyPct !== null ? `${Math.round(goals.occupancyPct)}%` : null} ok={goals.occupancyPct === null || m.occupancy * 100 >= goals.occupancyPct} />
                <Metric value={clp.format(m.adr)} goal={goals.averageRate !== null ? clp.format(goals.averageRate) : null} ok={goals.averageRate === null || m.adr >= goals.averageRate} />
                <Metric value={clp.format(m.revpar)} goal={revparGoal(goals) !== null ? clp.format(revparGoal(goals)!) : null} ok={revparGoal(goals) === null || m.revpar >= revparGoal(goals)!} />
              </tr>
            ))}
            <tr className="border-t bg-slate-50 font-bold">
              <td className="px-2 py-2">Total</td>
              <td className="px-2 py-2 text-right">{pct(total.occupancy)}</td>
              <td className="px-2 py-2 text-right">{clp.format(total.adr)}</td>
              <td className="px-2 py-2 text-right">{clp.format(total.revpar)}</td>
            </tr>
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-xs text-slate-500">
          Venta del mes: <b className="text-slate-700">{clp.format(total.revenue)}</b>. Tarifa = promedio por noche vendida; RevPAR = venta por habitación disponible. Bajo cada valor, la meta del hostal (en rojo si va por debajo).
        </p>
      </section>

      <section className="space-y-3">
        <nav className="flex flex-wrap gap-2" aria-label="Hostal del calendario">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/hostales?h=${u.code}`}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                u.id === current.id ? "border-[var(--oasis-primary)] bg-[var(--oasis-primary)] text-white" : "bg-white"
              }`}
            >
              {u.name.replace(/^Hostal\s+/i, "")}
            </Link>
          ))}
        </nav>
        <WeeklyCalendar
          key={current.id}
          showRoomStatus={calendar.housekeepingEnabled}
          rooms={calendar.rooms}
          reservations={calendar.reservations}
          initialStart={today}
        />
      </section>
    </div>
  );
}

function Metric({ value, goal, ok }: { value: string; goal: string | null; ok: boolean }) {
  return (
    <td className="px-2 py-2 text-right">
      <span className={ok ? "" : "text-red-700"}>{value}</span>
      {goal && <span className="block text-[11px] font-normal text-slate-400">meta {goal}</span>}
    </td>
  );
}
