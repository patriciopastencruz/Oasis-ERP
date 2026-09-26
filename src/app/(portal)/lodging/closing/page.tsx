import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { ClosingExpenses } from "@/components/lodging/closing-expenses";
import { lodgingContext } from "@/modules/lodging/application/queries";
import {
  findClosingId,
  listRecentClosings,
  liveMetrics,
  loadClosing,
} from "@/modules/lodging/application/closing-queries";
import { saveClosingAction } from "@/modules/lodging/application/closing-actions";
import {
  addDays,
  clp,
  closingPaymentLabels,
  formatClosingDate,
  isValidDay,
  pct,
  santiagoToday,
} from "@/modules/lodging/domain/daily-closing";

export default async function DailyClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; success?: string }>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.closings.create");
  const canManage = ctx.permissions.has("lodging.closings.manage");
  const canReports = ctx.permissions.has("lodging.closings.reports");
  const today = santiagoToday();
  const minDate = canManage ? undefined : addDays(today, -1);
  let date = isValidDay(q.date) ? q.date : today;
  if (date > today) date = today;
  if (minDate && date < minDate) date = minDate;

  const existingId = await findClosingId(supabase, unit.id, date);
  const existing = existingId ? await loadClosing(supabase, existingId) : null;
  // Recepción no reabre un cierre emitido: se muestra el cierre ya generado.
  if (existing?.closing.status === "issued" && !canManage && !q.error)
    redirect(`/lodging/closing/${existingId}`);
  const [metrics, recent] = await Promise.all([
    liveMetrics(supabase, unit.id, date),
    listRecentClosings(supabase, unit.id, 10),
  ]);
  const textarea =
    "mt-1 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0b4f9c]";
  const indicators: [string, string][] = [
    ["Total habitaciones", String(metrics.total_rooms)],
    ["Habitaciones ocupadas", String(metrics.occupied_rooms)],
    ["% Ocupación", pct(metrics.occupancy_pct)],
    ["Venta promedio general", clp(metrics.average_rate)],
    ...metrics.by_type.map((t) => [`Venta promedio ${t.room_type}`, clp(t.average_rate)] as [string, string]),
    ...(Object.keys(closingPaymentLabels) as (keyof typeof closingPaymentLabels)[])
      .filter((k) => ["cash", "transfer", "card", "airbnb"].includes(k) || metrics.payments_by_method[k])
      .map((k) => [`Monto ${closingPaymentLabels[k].toLowerCase()}`, clp(metrics.payments_by_method[k])] as [string, string]),
    ["Monto total recibido", clp(metrics.total_received)],
    ["Monto pendiente", clp(metrics.pending_amount)],
    ["Llegadas / salidas", `${metrics.arrivals} / ${metrics.departures}`],
    ["Huéspedes alojados", String(metrics.guests)],
  ];

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Cierre diario"
        description="Los indicadores se calculan solos con las reservas y los pagos recibidos en el día. Solo agrega los gastos y las observaciones, previsualiza y genera el PDF."
      />
      <nav className="mb-5 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-[#0b4f9c] bg-[#0b4f9c] px-3 py-1.5 font-medium text-white">Cierre diario</span>
        {canReports && (
          <Link href="/lodging/closing/reports" className="rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[#0b4f9c]">
            Reportabilidad de cierres
          </Link>
        )}
      </nav>
      {(q.error || q.success) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}

      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Fecha del cierre
          <input
            type="date"
            name="date"
            defaultValue={date}
            max={today}
            min={minDate}
            className="mt-1 block rounded-xl border bg-white px-3 py-2 text-sm"
          />
        </label>
        <button className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">Cambiar fecha</button>
        {!canManage && (
          <p className="text-xs text-slate-500">Puedes cerrar el día de hoy o, como máximo, el día anterior.</p>
        )}
      </form>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <form action={saveClosingAction} className="space-y-5">
          <input type="hidden" name="closing_date" value={date} />
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Indicadores del {formatClosingDate(date)}</h2>
              <span className="text-xs text-slate-500">Automático · se recalcula al emitir</span>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {indicators.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-dotted py-1">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {metrics.reservations_without_price > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                {metrics.reservations_without_price} reserva(s) activas sin precio: cárgales el monto para que la venta promedio sea correcta.
              </p>
            )}
          </Panel>

          <Panel>
            <h2 className="mb-3 font-semibold">Gastos del día</h2>
            <ClosingExpenses initial={existing?.expenses ?? []} />
          </Panel>

          <Panel className="space-y-3">
            <h2 className="font-semibold">Observaciones</h2>
            <label className="block text-sm">
              Problemas reportados
              <textarea name="reported_problems" maxLength={2000} defaultValue={existing?.closing.reported_problems ?? ""} className={`${textarea} min-h-16`} />
            </label>
            <label className="block text-sm">
              Elementos que deben reponerse
              <textarea name="items_to_replenish" maxLength={2000} defaultValue={existing?.closing.items_to_replenish ?? ""} className={`${textarea} min-h-16`} />
            </label>
            <label className="block text-sm">
              Observaciones generales
              <textarea name="observations" maxLength={4000} defaultValue={existing?.closing.observations ?? ""} className={`${textarea} min-h-28`} />
            </label>
            <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-3 text-sm font-semibold text-white">
              Guardar y previsualizar
            </button>
            {existing?.closing.status === "issued" && (
              <p className="text-xs text-amber-700">
                Este cierre ya fue emitido. Al guardar vuelve a borrador y deberás emitirlo de nuevo.
              </p>
            )}
          </Panel>
        </form>

        <Panel className="h-fit">
          <h2 className="mb-3 font-semibold">Últimos cierres</h2>
          {recent.length ? (
            <ul className="divide-y text-sm">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link href={`/lodging/closing/${c.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-[#0b4f9c]">
                    <span>{formatClosingDate(c.closing_date)}</span>
                    <span className="tabular-nums">{clp(Number(c.total_received))}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.status === "issued" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                    >
                      {c.status === "issued" ? "Emitido" : "Borrador"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Aún no hay cierres registrados.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
