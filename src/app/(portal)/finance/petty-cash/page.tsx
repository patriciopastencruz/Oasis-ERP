import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FolderOpen,
  ReceiptText,
} from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  clp,
  formatWeek,
} from "@/modules/finance/petty-cash/domain/petty-cash";
import {
  currentWeekSummary,
  pettyCashContext,
} from "@/modules/finance/petty-cash/application/queries";

export default async function PettyCashHome() {
  const { ctx, selected } = await pettyCashContext();
  const summary = await currentWeekSummary(selected?.id);
  const supabase = await createSupabaseServerClient();
  const { data: recent } = await supabase
    .from("petty_cash_reports")
    .select(
      "id,report_number,status,total_registered,updated_at,week_start,week_end",
    )
    .eq("responsible_id", ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(5);
  const cards = [
    {
      href: "/finance/petty-cash/new",
      label: "Nueva rendición",
      description: "Registra gastos y guarda un borrador.",
      icon: FilePlus2,
      permission: "finance.petty_cash.create",
    },
    {
      href: "/finance/petty-cash/my-reports",
      label: "Mis rendiciones",
      description: "Consulta borradores, envíos y correcciones.",
      icon: FolderOpen,
      permission: "finance.petty_cash.view_own",
    },
    {
      href: "/finance/petty-cash/reviews",
      label: "Bandeja de revisión",
      description: "Revisa rendiciones de tus unidades.",
      icon: Clock3,
      permission: "finance.petty_cash.review",
    },
    {
      href: "/finance/petty-cash/approved",
      label: "Rendiciones aprobadas",
      description: "Consulta los respaldos definitivos.",
      icon: CheckCircle2,
      permission: "finance.petty_cash.reports.view",
    },
    {
      href: "/finance/petty-cash/reports",
      label: "Reportes y exportación",
      description: "Filtra y exporta el detalle semanal.",
      icon: BarChart3,
      permission: "finance.petty_cash.reports.view",
    },
    {
      href: "/finance/petty-cash/dashboard",
      label: "Panel de Caja Chica",
      description: "Indicadores por unidad, trabajador y categoría.",
      icon: BarChart3,
      permission: "finance.petty_cash.reports.view",
    },
  ];
  return (
    <>
      <PageHeader
        title="Caja Chica"
        description="Registra y rinde gastos menores con control semanal."
        eyebrow="Finanzas · Rendiciones semanales"
      />
      {summary && (
        <>
          <p className="mb-3 text-sm font-semibold">
            Semana del {formatWeek(summary.week_start, summary.week_end)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Límite semanal" value={clp(summary.weekly_limit)} />
            <Kpi label="Total comprometido" value={clp(summary.committed)} />
            <Kpi
              label="Saldo disponible"
              value={clp(summary.available)}
              highlight
            />
            <Kpi
              label="Rendiciones / gastos"
              value={`${summary.report_count} / ${summary.line_count}`}
            />
          </div>
        </>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards
          .filter(
            (card) =>
              ctx.permissions.has(card.permission) ||
              (card.permission === "finance.petty_cash.view_own" &&
                ctx.permissions.has("finance.petty_cash.create")),
          )
          .map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href}>
              <Panel className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                <Icon className="text-[#277a55]" />
                <h2 className="mt-3 font-semibold">{label}</h2>
                <p className="mt-1 text-sm text-slate-600">{description}</p>
              </Panel>
            </Link>
          ))}
      </div>
      <Panel className="mt-5">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-[#277a55]" />
          <h2 className="font-semibold">Rendiciones recientes</h2>
        </div>
        <div className="mt-3 divide-y">
          {recent?.map((report) => (
            <Link
              href={`/finance/petty-cash/reports/${report.id}`}
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span>
                <b>{report.report_number ?? "Borrador"}</b>
                <span className="ml-2 text-slate-500">
                  {formatWeek(report.week_start, report.week_end)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <b>{clp(report.total_registered)}</b>
                <StatusBadge value={report.status} />
              </span>
            </Link>
          ))}
          {!recent?.length && (
            <p className="py-8 text-center text-sm text-slate-500">
              Aún no tienes rendiciones.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Panel className={highlight ? "border-emerald-300 bg-emerald-50" : ""}>
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <b className="mt-2 block text-xl">{value}</b>
    </Panel>
  );
}
