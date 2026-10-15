import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { HostelDashboard } from "@/components/kpis/hostel-dashboard";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import { WeeklyHostelsPdfForm } from "@/components/lodging/weekly-hostels-pdf-form";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadGroupWeeklyReport } from "@/modules/lodging/application/group-weekly-queries";
import { defaultClosingDate, isValidDay, santiagoToday } from "@/modules/lodging/domain/daily-closing";

export const dynamic = "force-dynamic";

export default async function KpisPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const q = await searchParams;
  const ctx = await requirePermission("kpis.view");
  const units = lodgingUnitCodes
    .map((code) => ctx.units.find((u) => u.code === code))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));
  const today = santiagoToday();
  // En vivo por defecto: del 1 del mes a hoy. Con ?date= se ve el corte de otro día.
  const reference = isValidDay(q.date) && q.date <= today ? q.date : today;
  const live = reference === today;

  if (!units.length)
    return (
      <>
        <PageHeader eyebrow="Indicadores KPIs" title="Indicadores de los hostales" description="Tablero transversal de los 3 hostales." />
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No tienes hostales asignados.</p>
      </>
    );

  const report = await loadGroupWeeklyReport(await createSupabaseServerClient(), units, reference, defaultClosingDate());
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Indicadores KPIs"
          title="Indicadores de los hostales"
          description="Ocupación, venta, inspecciones, puntaje de Booking y cobros pendientes de los 3 hostales en un solo tablero. Se actualiza solo mientras lo tengas abierto."
        />
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <LiveRefresh generatedAt={new Date().toISOString()} />
          ) : (
            <a href="/kpis" className="rounded-xl border border-[#d9dfe6] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b4f9c]">
              Viendo el corte al {reference.split("-").reverse().join("-")} · volver a en vivo
            </a>
          )}
          <form method="get" className="flex items-center gap-2 rounded-xl border border-[#d9dfe6] bg-white px-3 py-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Ver corte al
              <input
                type="date"
                name="date"
                defaultValue={reference}
                max={today}
                className="rounded-lg border border-[#d9dfe6] px-2 py-1 text-sm font-normal text-slate-800"
              />
            </label>
            <button className="rounded-lg border border-[#0b4f9c] px-2.5 py-1 text-xs font-semibold text-[#0b4f9c]">Ver</button>
          </form>
          <Link href="/kpis/bonos" className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-white">
            Bono de recepción →
          </Link>
          <WeeklyHostelsPdfForm />
          <a
            href={`/api/lodging/weekly-hostels.pdf?date=${reference}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-[#0b4f9c]"
          >
            <Download size={14} /> PDF de lo que ves
          </a>
        </div>
      </div>
      <HostelDashboard report={report} live={live} />
    </>
  );
}
