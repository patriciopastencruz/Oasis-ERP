import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import {
  cashFlowContext,
  loadMonth,
} from "@/modules/finance/cash-flow/application/queries";
import {
  chileToday,
  clp,
  formatDay,
  formatMonth,
  resolveMonth,
  shiftMonth,
  summarizeMonth,
  type CategoryTotal,
} from "@/modules/finance/cash-flow/domain/cash-flow";
import { CashFlowTabs, Kpi, signedTone } from "@/modules/finance/cash-flow/ui";

const percent = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });

function CategoryBreakdown({
  title,
  rows,
  total,
  color,
}: {
  title: string;
  rows: CategoryTotal[];
  total: number;
  color: string;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm font-semibold tabular-nums">{clp.format(total)}</span>
      </div>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.category_id} className="text-sm">
              <div className="flex justify-between gap-3">
                <span>{row.name}</span>
                <span className="tabular-nums">
                  {clp.format(row.amount)} <span className="text-slate-500">· {percent.format(row.share)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.max(row.share * 100, 1)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Sin movimientos en el mes.</p>
      )}
    </Panel>
  );
}

export default async function CashFlowMonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const q = await searchParams;
  const { unit, supabase, canManage } = await cashFlowContext();
  const today = chileToday();
  const month = resolveMonth(q.month, today);
  const { entries, closings } = await loadMonth(supabase, unit.id, month);
  const summary = summarizeMonth(month, entries, closings, today);
  const isCurrent = month === today.slice(0, 7);

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Caja mensual"
        description="Consolidado del mes a partir de los movimientos diarios: ingresos, gastos y utilidad de la unidad."
      />
      <CashFlowTabs active="monthly" canManage={canManage} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/finance/cash-flow/monthly?month=${shiftMonth(month, -1)}`}
          aria-label="Mes anterior"
          className="grid size-10 place-items-center rounded-xl border bg-white"
        >
          <ChevronLeft size={18} />
        </Link>
        <form className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={month}
            max={today.slice(0, 7)}
            className="rounded-xl border bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Ir</button>
        </form>
        {!isCurrent && (
          <Link
            href={`/finance/cash-flow/monthly?month=${shiftMonth(month, 1)}`}
            aria-label="Mes siguiente"
            className="grid size-10 place-items-center rounded-xl border bg-white"
          >
            <ChevronRight size={18} />
          </Link>
        )}
        <p className="text-sm font-semibold first-letter:uppercase">{formatMonth(month)}</p>
        <a
          href={`/api/finance/cash-flow/monthly.xlsx?month=${month}`}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          <Download size={16} /> Exportar Excel
        </a>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ingresos del mes" value={clp.format(summary.totals.income)} tone="income" />
        <Kpi label="Gastos del mes" value={clp.format(summary.totals.expense)} tone="expense" />
        <Kpi
          label="Utilidad"
          value={clp.format(summary.totals.net)}
          tone={signedTone(summary.totals.net)}
          hint={summary.totals.margin === null ? undefined : `Margen ${percent.format(summary.totals.margin)}`}
        />
        <Kpi
          label="Días cerrados"
          value={`${summary.closedDays} / ${summary.days.length}`}
          hint={
            summary.pendingDays
              ? `${summary.pendingDays} día(s) con movimientos sin cerrar`
              : "Sin días con movimientos pendientes de cierre"
          }
        />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <CategoryBreakdown
          title="Ingresos por categoría"
          rows={summary.incomeCategories}
          total={summary.totals.income}
          color="bg-emerald-600"
        />
        <CategoryBreakdown
          title="Gastos por categoría"
          rows={summary.expenseCategories}
          total={summary.totals.expense}
          color="bg-red-600"
        />
      </div>

      <Panel>
        <h2 className="mb-3 font-semibold">Detalle diario</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Fecha</th>
                <th className="pb-2 text-right">Ingresos</th>
                <th className="pb-2 text-right">Gastos</th>
                <th className="pb-2 text-right">Resultado</th>
                <th className="pb-2 text-right">Acumulado</th>
                <th className="pb-2 pl-4">Cierre</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {summary.days.reduce<{ rows: React.ReactNode[]; running: number }>(
                (acc, d) => {
                  acc.running += d.net;
                  acc.rows.push(
                    <tr key={d.date} className={`border-t ${d.entries ? "" : "text-slate-400"}`}>
                      <td className="py-2 first-letter:uppercase">
                        <Link href={`/finance/cash-flow?date=${d.date}`} className="hover:underline">
                          {formatDay(d.date, { weekday: "short", day: "2-digit", month: "2-digit" })}
                        </Link>
                      </td>
                      <td className="text-right text-emerald-700">{d.income ? clp.format(d.income) : "—"}</td>
                      <td className="text-right text-red-700">{d.expense ? clp.format(d.expense) : "—"}</td>
                      <td className="text-right font-semibold">{d.entries ? clp.format(d.net) : "—"}</td>
                      <td className="text-right">{clp.format(acc.running)}</td>
                      <td className="pl-4">
                        {d.status === "closed" ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Cerrado
                          </span>
                        ) : d.entries ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Pendiente
                          </span>
                        ) : (
                          <span className="text-xs">Sin movimientos</span>
                        )}
                      </td>
                    </tr>,
                  );
                  return acc;
                },
                { rows: [], running: 0 },
              ).rows}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 font-semibold">
                <td className="py-2">Total</td>
                <td className="text-right text-emerald-700">{clp.format(summary.totals.income)}</td>
                <td className="text-right text-red-700">{clp.format(summary.totals.expense)}</td>
                <td className="text-right">{clp.format(summary.totals.net)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {summary.methods.length > 0 && (
        <Panel className="mt-5">
          <h2 className="mb-3 font-semibold">Por medio de pago</h2>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Medio</th>
                <th className="pb-2 text-right">Ingresos</th>
                <th className="pb-2 text-right">Gastos</th>
                <th className="pb-2 text-right">Neto</th>
              </tr>
            </thead>
            <tbody>
              {summary.methods.map((m) => (
                <tr key={m.method} className="border-t">
                  <td className="py-2">{m.label}</td>
                  <td className="text-right">{clp.format(m.income)}</td>
                  <td className="text-right">{clp.format(m.expense)}</td>
                  <td className="text-right font-semibold">{clp.format(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
