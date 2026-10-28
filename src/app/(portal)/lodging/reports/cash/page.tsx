import Link from "next/link";
import { Banknote, ChevronLeft, ChevronRight, FileText, Undo2, Ban } from "lucide-react";
import { LodgingReportTabs } from "@/components/lodging/report-tabs";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";
import { loadCashReport } from "@/modules/lodging/application/cash-queries";
import { CASH_TYPE_LABELS } from "@/modules/lodging/domain/cash-report";
import { originLabels, parseHistoryMonth, shiftMonth } from "@/modules/lodging/domain/history-report";
import { lodgingUnitCodes } from "@/config/business-units";

function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
const dayTitle = (iso: string) => {
  const label = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export default async function CashReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.closings.reports");
  const month = parseHistoryMonth(q.month);
  const report = await loadCashReport(supabase, unit.id, month);
  const href = (m: string) => `/lodging/reports/cash?month=${m}`;
  const hostelCount = ctx.units.filter((u) => lodgingUnitCodes.includes(u.code)).length;
  const cards = [
    ["Efectivo del mes", clp.format(report.total), Banknote],
    ["Cobrado", clp.format(report.collected), Banknote],
    ["Reembolsos", clp.format(report.refunded), Undo2],
    ["Pagos anulados", report.voidedCount ? `${report.voidedCount} · ${clp.format(report.voidedTotal)}` : "0", Ban],
  ] as const;

  return (
    <>
      <LodgingReportTabs active="cash" permissions={ctx.permissions} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Efectivo del mes"
          description="Todos los pagos recibidos en efectivo, con día, habitación, huésped y quién los registró."
        />
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2">
          <a
            href={`/api/lodging/cash.pdf?month=${month}`}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#0b4f9c] px-3 text-sm font-semibold text-[#0b4f9c] hover:bg-sky-50"
          >
            <FileText size={16} /> Descargar PDF
          </a>
          {hostelCount > 1 && (
            <a
              href={`/api/lodging/cash.pdf?month=${month}&unit=all`}
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:border-[#0b4f9c]"
            >
              Todos los hostales
            </a>
          )}
          <Link href={href(shiftMonth(month, -1))} aria-label="Mes anterior" className="grid size-9 place-items-center rounded-lg border">
            <ChevronLeft size={17} />
          </Link>
          <form className="flex items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="rounded-lg border px-2 py-1.5 text-sm" />
            <button className="rounded-lg bg-[#0b4f9c] px-3 py-1.5 text-sm font-semibold text-white">Ver</button>
          </form>
          <Link href={href(shiftMonth(month, 1))} aria-label="Mes siguiente" className="grid size-9 place-items-center rounded-lg border">
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>

      <div className="mb-5 mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-[#d9dfe6] bg-white p-4 shadow-[0_10px_30px_rgba(20,57,39,.04)]">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-[#0b4f9c]">
              <Icon size={17} />
            </span>
            <b className="mt-3 block text-2xl leading-none text-slate-800">{value}</b>
            <span className="mt-1.5 block text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      <Panel>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Detalle · {monthLabel(month)}</h2>
        {report.days.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Hora</th>
                  <th className="pr-3">Hab.</th>
                  <th className="pr-3">Huésped</th>
                  <th className="pr-3">Tipo</th>
                  <th className="pr-3">Registró</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              {report.days.map((day) => (
                <tbody key={day.day} className="border-b">
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="py-2 pl-2 font-semibold text-[#0b2f5f]">{dayTitle(day.day)}</td>
                    <td className="py-2 pr-2 text-right font-semibold">{clp.format(day.total)}</td>
                  </tr>
                  {day.entries.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 text-slate-500">{e.time}</td>
                      <td className="pr-3">{e.room ?? "—"}</td>
                      <td className="pr-3">
                        {e.guest ?? "Sin nombre"}
                        {e.origin && <span className="ml-1 text-xs text-slate-500">({originLabels[e.origin] ?? e.origin})</span>}
                      </td>
                      <td className="pr-3">{CASH_TYPE_LABELS[e.type] ?? e.type}</td>
                      <td className="pr-3 text-slate-600">{e.registeredBy ?? "—"}</td>
                      <td className={`text-right tabular-nums ${e.amount < 0 ? "font-semibold text-red-700" : ""}`}>{clp.format(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sin pagos en efectivo en este mes.</p>
        )}
      </Panel>
    </>
  );
}
