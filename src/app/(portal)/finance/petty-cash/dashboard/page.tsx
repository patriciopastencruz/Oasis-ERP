import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import {
  chileWeek,
  clp,
  formatWeek,
} from "@/modules/finance/petty-cash/domain/petty-cash";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekHref(params: Record<string, string | undefined>, week: string) {
  const query = new URLSearchParams();
  if (params.unit) query.set("unit", params.unit);
  if (params.status) query.set("status", params.status);
  query.set("week", week);
  return `/finance/petty-cash/dashboard?${query.toString()}`;
}

export default async function PettyCashDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSession();
  if (!ctx.permissions.has("finance.petty_cash.reports.view"))
    redirect("/no-access");
  const params = await searchParams;
  const currentWeekStart = chileWeek().start;
  const week = params.week || currentWeekStart;
  const isCurrentWeek = week === currentWeekStart;
  const supabase = await createSupabaseServerClient();
  let reportQuery = supabase
    .from("petty_cash_reports")
    .select(
      "id,status,total_registered,total_approved,responsible_id,business_unit_id,business_units(name),responsible:profiles!petty_cash_reports_responsible_id_fkey(first_name,last_name)",
    )
    .eq("week_start", week)
    .is("deleted_at", null);
  if (params.unit)
    reportQuery = reportQuery.eq("business_unit_id", params.unit);
  if (params.status) reportQuery = reportQuery.eq("status", params.status);
  const { data: reports } = await reportQuery;
  const ids = (reports ?? []).map((report) => report.id);
  const { data: lines } = ids.length
    ? await supabase
        .from("petty_cash_expense_lines")
        .select("amount,expense_categories(name)")
        .in("petty_cash_report_id", ids)
        .is("deleted_at", null)
    : { data: [] };
  const committedStates = new Set([
    "submitted",
    "under_review",
    "correction_requested",
    "resubmitted",
    "approved",
  ]);
  const pendingStates = new Set(["submitted", "under_review", "resubmitted"]);
  const metrics = {
    pending: (reports ?? []).filter((report) =>
      pendingStates.has(report.status),
    ).length,
    correction: (reports ?? []).filter(
      (report) => report.status === "correction_requested",
    ).length,
    approved: (reports ?? []).filter((report) => report.status === "approved")
      .length,
    rejected: (reports ?? []).filter((report) => report.status === "rejected")
      .length,
    total: (reports ?? [])
      .filter((report) => committedStates.has(report.status))
      .reduce((sum, report) => sum + Number(report.total_registered), 0),
    approvedTotal: (reports ?? []).reduce(
      (sum, report) => sum + Number(report.total_approved),
      0,
    ),
    pendingTotal: (reports ?? [])
      .filter(
        (report) =>
          pendingStates.has(report.status) ||
          report.status === "correction_requested",
      )
      .reduce((sum, report) => sum + Number(report.total_registered), 0),
  };
  const byUnit = aggregate(
    reports ?? [],
    (report) =>
      one<{ name?: string }>(report.business_units)?.name ?? "Sin unidad",
    (report) => Number(report.total_registered),
  );
  const byWorker = aggregate(
    reports ?? [],
    (report) => {
      const worker = one<{ first_name?: string; last_name?: string }>(
        report.responsible,
      );
      return (
        `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim() ||
        "Sin trabajador"
      );
    },
    (report) => Number(report.total_registered),
  );
  const byCategory = aggregate(
    lines ?? [],
    (line) =>
      one<{ name?: string }>(line.expense_categories)?.name ?? "Sin categoría",
    (line) => Number(line.amount),
  );
  return (
    <>
      <PageHeader
        title="Panel de Caja Chica"
        description="Indicadores semanales dentro de tus unidades autorizadas."
        eyebrow="Finanzas · Caja Chica"
      />
      <Panel className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded-lg border px-3 py-2 text-xs font-medium"
            href={weekHref(params, addDays(week, -7))}
          >
            ← Semana anterior
          </Link>
          <span className="text-sm font-semibold">
            Semana del {formatWeek(week, addDays(week, 6))}
          </span>
          <Link
            className="rounded-lg border px-3 py-2 text-xs font-medium"
            href={weekHref(params, addDays(week, 7))}
          >
            Semana siguiente →
          </Link>
          {!isCurrentWeek && (
            <Link
              className="ml-auto rounded-lg border px-3 py-2 text-xs font-medium"
              href={weekHref(params, currentWeekStart)}
            >
              Volver a la semana actual
            </Link>
          )}
        </div>
      </Panel>
      <Panel>
        <form className="grid gap-2 md:grid-cols-4">
          <select
            name="unit"
            defaultValue={params.unit}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todas las unidades</option>
            {ctx.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input
            name="week"
            type="date"
            defaultValue={week}
            className="rounded-xl border p-2.5 text-sm"
          />
          <select
            name="status"
            defaultValue={params.status}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="submitted">Enviadas</option>
            <option value="correction_requested">En corrección</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
          </select>
          <button className="rounded-xl bg-[#173f2d] px-4 text-sm font-semibold text-white">
            Actualizar
          </button>
        </form>
      </Panel>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pendientes" value={String(metrics.pending)} />
        <Kpi label="En corrección" value={String(metrics.correction)} />
        <Kpi
          label="Aprobadas / rechazadas"
          value={`${metrics.approved} / ${metrics.rejected}`}
        />
        <Kpi label="Total rendido" value={clp(metrics.total)} />
        <Kpi label="Total aprobado" value={clp(metrics.approvedTotal)} />
        <Kpi label="Total pendiente" value={clp(metrics.pendingTotal)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Breakdown title="Por trabajador" rows={byWorker} />
        <Breakdown title="Por unidad" rows={byUnit} />
        <Breakdown title="Por categoría" rows={byCategory} />
      </div>
    </>
  );
}
function aggregate<T>(
  rows: T[],
  label: (row: T) => string,
  amount: (row: T) => number,
) {
  const values = new Map<string, number>();
  rows.forEach((row) =>
    values.set(label(row), (values.get(label(row)) ?? 0) + amount(row)),
  );
  return [...values.entries()].sort((a, b) => b[1] - a[1]);
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Panel>
      <span className="text-xs uppercase text-slate-500">{label}</span>
      <b className="mt-2 block text-xl">{value}</b>
    </Panel>
  );
}
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, number]>;
}) {
  const max = Math.max(...rows.map((row) => row[1]), 1);
  return (
    <Panel>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.slice(0, 10).map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between gap-3 text-sm">
              <span>{label}</span>
              <b>{clp(value)}</b>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#277a55]"
                style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {!rows.length && (
          <p className="text-sm text-slate-500">Sin datos para el filtro.</p>
        )}
      </div>
    </Panel>
  );
}
function one<T>(value: unknown): T | undefined {
  return (Array.isArray(value) ? value[0] : value) as T | undefined;
}
