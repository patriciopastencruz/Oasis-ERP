import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadIssuedClosings } from "@/modules/lodging/application/closing-queries";
import {
  clp,
  formatClosingDate,
  isValidDay,
  pct,
  periodLabels,
  periodRange,
  santiagoToday,
  shiftPeriod,
  summarizePeriod,
  type PeriodKind,
} from "@/modules/lodging/domain/daily-closing";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function ClosingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.closings.reports");
  const today = santiagoToday();
  const kind: PeriodKind = q.period === "week" || q.period === "fortnight" ? q.period : "month";
  const reference = isValidDay(q.date) && q.date <= today ? q.date : today;
  const range = periodRange(kind, reference);
  const closings = await loadIssuedClosings(supabase, unit.id, range);
  const s = summarizePeriod(closings, range, today);
  const next = shiftPeriod(kind, reference, 1);
  const link = (period: PeriodKind, date: string) => `/lodging/closing/reports?period=${period}&date=${date}`;

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Reportes de cierres"
        description="Consolidado de los cierres diarios emitidos: ingreso efectivo, gasto acumulado, ocupación y disponibilidad promedio."
      />
      <nav className="mb-5 flex flex-wrap gap-2 text-sm">
        {ctx.permissions.has("lodging.closings.create") && (
          <Link href="/lodging/closing" className="rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[#0b4f9c]">
            Cierre diario
          </Link>
        )}
        <span className="rounded-full border border-[#0b4f9c] bg-[#0b4f9c] px-3 py-1.5 font-medium text-white">Reportes de cierres</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(Object.keys(periodLabels) as PeriodKind[]).map((p) => (
          <Link
            key={p}
            href={link(p, reference)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${p === kind ? "border-[#0b4f9c] bg-[#edf4fc] text-[#0b4f9c]" : "bg-white"}`}
          >
            {periodLabels[p]}
          </Link>
        ))}
        <span className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />
        <Link href={link(kind, shiftPeriod(kind, reference, -1))} aria-label="Período anterior" className="grid size-9 place-items-center rounded-xl border bg-white">
          <ChevronLeft size={17} />
        </Link>
        <span className="text-sm font-semibold">
          {formatClosingDate(range.start)} al {formatClosingDate(range.end)}
        </span>
        {next <= today && (
          <Link href={link(kind, next)} aria-label="Período siguiente" className="grid size-9 place-items-center rounded-xl border bg-white">
            <ChevronRight size={17} />
          </Link>
        )}
        <a
          href={`/api/lodging/closing/period.pdf?period=${kind}&date=${reference}`}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white"
        >
          <Download size={16} /> PDF del cierre {periodLabels[kind].toLowerCase()}
        </a>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ingreso efectivo" value={clp(s.totalReceived)} hint={`Promedio diario ${clp(s.averageDailyIncome)}`} />
        <Kpi label="Gasto acumulado" value={clp(s.expenseTotal)} />
        <Kpi label="Resultado" value={clp(s.netResult)} hint="Ingreso efectivo − gasto" />
        <Kpi label="Días con cierre" value={`${s.closedDays} / ${s.elapsedDays}`} hint={s.missingDates.length ? `${s.missingDates.length} día(s) sin cierre emitido` : "Todos los días cerrados"} />
        <Kpi label="% Ocupación promedio" value={pct(s.occupancyPct)} />
        <Kpi
          label="Disponibilidad promedio"
          value={s.averageAvailableRooms.toLocaleString("es-CL", { maximumFractionDigits: 1 })}
          hint="Habitaciones libres por día"
        />
        <Kpi label="Venta promedio" value={clp(s.averageRate)} hint="Por habitación ocupada" />
        <Kpi label="Pendiente (último cierre)" value={clp(s.lastPending)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Panel className="h-fit">
          <h2 className="mb-3 font-semibold">Ingreso por medio de pago</h2>
          <dl className="space-y-2 text-sm">
            {(
              [
                ["Efectivo", s.byMethod.cash],
                ["Transferencia", s.byMethod.transfer],
                ["Tarjeta", s.byMethod.card],
                ["Airbnb", s.byMethod.airbnb],
                ["Otros", s.byMethod.other],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-dotted py-1">
                <dt>{label}</dt>
                <dd className="font-semibold tabular-nums">{clp(value)}</dd>
              </div>
            ))}
          </dl>
          {s.missingDates.length > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Sin cierre emitido: {s.missingDates.map(formatClosingDate).join(", ")}
            </p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-semibold">Detalle por día</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm tabular-nums">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2 text-right">Ocupación</th>
                  <th className="pb-2 text-right">Ingreso</th>
                  <th className="pb-2 text-right">Gasto</th>
                  <th className="pb-2 text-right">Resultado</th>
                  <th className="pb-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {s.days.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-2">
                      <Link href={`/lodging/closing/${d.id}`} className="font-medium text-[#0b4f9c] hover:underline">
                        {formatClosingDate(d.closing_date)}
                      </Link>
                    </td>
                    <td className="text-right">
                      {d.occupied_rooms}/{d.total_rooms} · {pct(d.occupancy_pct)}
                    </td>
                    <td className="text-right">{clp(d.total_received)}</td>
                    <td className="text-right">{clp(d.expense_total)}</td>
                    <td className="text-right font-semibold">{clp(d.net_result)}</td>
                    <td className="text-right">{clp(d.pending_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2">Total</td>
                  <td className="text-right">{pct(s.occupancyPct)}</td>
                  <td className="text-right">{clp(s.totalReceived)}</td>
                  <td className="text-right">{clp(s.expenseTotal)}</td>
                  <td className="text-right">{clp(s.netResult)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {!s.days.length && <p className="py-8 text-center text-sm text-slate-500">No hay cierres emitidos en este período.</p>}
        </Panel>
      </div>
    </>
  );
}
