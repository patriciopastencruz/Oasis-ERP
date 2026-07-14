import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { uiLabel } from "@/lib/ui-labels";
import {
  clp,
  formatWeek,
  pettyCashStatuses,
} from "@/modules/finance/petty-cash/domain/petty-cash";

export default async function MyPettyCashReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const size = 10;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("petty_cash_reports")
    .select(
      "id,report_number,status,total_registered,total_lines,week_start,week_end,updated_at,business_units(name)",
      { count: "exact" },
    )
    .eq("responsible_id", ctx.user.id)
    .is("deleted_at", null);
  if (params.q)
    query = query.or(
      `report_number.ilike.%${params.q}%,general_reason.ilike.%${params.q}%`,
    );
  if (params.status) query = query.eq("status", params.status);
  if (params.unit) query = query.eq("business_unit_id", params.unit);
  if (params.week) query = query.eq("week_start", params.week);
  const { data, count } = await query
    .order("updated_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  return (
    <>
      <PageHeader
        title="Mis rendiciones"
        description="Continúa borradores y revisa el estado de tus rendiciones."
        eyebrow="Finanzas · Caja Chica"
      />
      <Panel>
        <form className="grid gap-2 md:grid-cols-4">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Buscar correlativo o motivo"
            className="rounded-xl border p-2.5 text-sm"
          />
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
          <select
            name="status"
            defaultValue={params.status}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todos los estados</option>
            {pettyCashStatuses.map((status) => (
              <option key={status} value={status}>
                {uiLabel(status)}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[#173f2d] px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </Panel>
      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="pb-3">Correlativo</th>
                <th>Semana</th>
                <th>Unidad</th>
                <th>Líneas</th>
                <th>Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((report) => {
                const unit = Array.isArray(report.business_units)
                  ? report.business_units[0]
                  : report.business_units;
                return (
                  <tr key={report.id} className="border-t">
                    <td className="py-4 font-semibold">
                      {report.report_number ?? "Borrador"}
                    </td>
                    <td>{formatWeek(report.week_start, report.week_end)}</td>
                    <td>{unit?.name}</td>
                    <td>{report.total_lines}</td>
                    <td>{clp(report.total_registered)}</td>
                    <td>
                      <StatusBadge value={report.status} />
                    </td>
                    <td>
                      <Link
                        href={`/finance/petty-cash/reports/${report.id}`}
                        className="font-semibold text-[#277a55]"
                      >
                        {["draft", "correction_requested"].includes(
                          report.status,
                        )
                          ? "Continuar"
                          : "Ver"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="py-12 text-center text-sm text-slate-500">
            No encontramos rendiciones.
          </p>
        )}
        <div className="mt-4 flex justify-between border-t pt-4 text-sm">
          <span>
            Página {page} de {pages} · {count ?? 0} registros
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ query: { ...params, page: page - 1 } }}
                className="rounded-lg border px-3 py-1.5"
              >
                Anterior
              </Link>
            )}
            {page < pages && (
              <Link
                href={{ query: { ...params, page: page + 1 } }}
                className="rounded-lg border px-3 py-1.5"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}
