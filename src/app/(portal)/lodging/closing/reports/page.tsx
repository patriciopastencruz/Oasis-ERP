import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { LodgingReportTabs } from "@/components/lodging/report-tabs";
import { PeriodExecutive } from "@/components/lodging/period-executive";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadPeriodReport } from "@/modules/lodging/application/period-queries";
import { isValidDay, santiagoToday, shiftPeriod, type PeriodKind } from "@/modules/lodging/domain/daily-closing";

const tabs: [PeriodKind, string][] = [
  ["week", "Semanal"],
  ["fortnight", "Quincenal"],
  ["month", "Mensual"],
];

export default async function ClosingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.closings.reports");
  const today = santiagoToday();
  const reference = isValidDay(q.date) && q.date <= today ? q.date : today;
  // El informe mensual es el Cierre mensual gerencial.
  if (q.period === "month") redirect(`/lodging/monthly?month=${reference.slice(0, 7)}`);
  const kind: PeriodKind = q.period === "fortnight" ? "fortnight" : "week";
  const report = await loadPeriodReport(supabase, unit.id, kind, reference);
  const next = shiftPeriod(kind, reference, 1);
  const link = (period: PeriodKind, date: string) => `/lodging/closing/reports?period=${period}&date=${date}`;

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Reportabilidad"
        description="Resumen ejecutivo semanal y quincenal: cobros, ocupación, venta por habitación, gastos por categoría y control, comparados con el período anterior."
      />
      <LodgingReportTabs active="closings" permissions={ctx.permissions} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {tabs.map(([p, label]) => (
          <Link
            key={p}
            href={link(p, reference)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${p === kind ? "border-[#0b4f9c] bg-[#edf4fc] text-[#0b4f9c]" : "bg-white"}`}
          >
            {label}
          </Link>
        ))}
        <span className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />
        <Link href={link(kind, shiftPeriod(kind, reference, -1))} aria-label="Período anterior" className="grid size-9 place-items-center rounded-xl border bg-white">
          <ChevronLeft size={17} />
        </Link>
        <span className="text-sm font-semibold">{report.rangeLabel}</span>
        {next <= today && (
          <Link href={link(kind, next)} aria-label="Período siguiente" className="grid size-9 place-items-center rounded-xl border bg-white">
            <ChevronRight size={17} />
          </Link>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${report.missingDates.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {report.closedDays}/{report.ops.elapsedDays} días cerrados
        </span>
        <a
          href={`/api/lodging/closing/period.pdf?period=${kind}&date=${reference}`}
          target="_blank"
          rel="noopener"
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white"
        >
          <Download size={16} /> PDF del resumen {kind === "week" ? "semanal" : "quincenal"}
        </a>
      </div>

      <PeriodExecutive report={report} />
    </>
  );
}
