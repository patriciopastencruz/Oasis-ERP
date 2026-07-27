import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { Notice, ProjectListTabs, inputClass } from "@/modules/sales/ui";
import { clp, projectStatuses } from "@/modules/sales/projects/domain/project";
import {
  listProjects,
  listUnitMembers,
  projectExpenseTotals,
  projectsContext,
  type ProjectListRow,
} from "@/modules/sales/projects/application/queries";
import { uiLabel } from "@/lib/ui-labels";

function personName(p: { first_name?: string; last_name?: string } | null) {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, company, supabase } = await projectsContext(
    "sales.projects.view",
  );
  const canCreate = ctx.permissions.has("sales.projects.create");

  const [projects, members] = await Promise.all([
    listProjects(supabase, company.id, unit.id, {
      search: q.search,
      status: q.status,
      responsible: q.responsible,
      order: q.order === "oldest" ? "oldest" : "recent",
    }),
    listUnitMembers(supabase, company.id, unit.id),
  ]);

  const totalsByProject = await Promise.all(
    projects.map((p) => projectExpenseTotals(supabase, p.id)),
  );

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Proyectos"
        description="Seguimiento de proyectos convertidos desde cotizaciones aceptadas, sus gastos y su estado de resultados."
      />
      <ProjectListTabs canCreate={canCreate} />
      <Notice success={q.success} error={q.error} />

      <Panel className="mb-4">
        <form className="grid gap-2 md:grid-cols-5">
          <input
            className={inputClass}
            name="search"
            placeholder="Buscar por nombre, código o cliente"
            defaultValue={q.search}
          />
          <select className={inputClass} name="status" defaultValue={q.status}>
            <option value="">Todos los estados</option>
            {projectStatuses.map((status) => (
              <option key={status} value={status}>
                {uiLabel(status)}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            name="responsible"
            defaultValue={q.responsible}
          >
            <option value="">Todos los responsables</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {personName(m)}
              </option>
            ))}
          </select>
          <select className={inputClass} name="order" defaultValue={q.order}>
            <option value="recent">Más recientes primero</option>
            <option value="oldest">Más antiguos primero</option>
          </select>
          <button className="rounded-xl bg-[var(--oasis-primary)] px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[#63778e]">
              <th className="p-2">Código</th>
              <th>Nombre</th>
              <th>Cliente</th>
              <th>Cotización</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th>Inicio</th>
              <th>Término estimado</th>
              <th className="text-right">Ingreso neto</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Resultado</th>
              <th>Actualizado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p: ProjectListRow, index: number) => {
              const netIncome = Number(p.net_income);
              const netExpenses = totalsByProject[index]?.net ?? 0;
              const result = netIncome - netExpenses;
              const responsible = p.responsible;
              const quotation = p.quotation;
              return (
                <tr key={p.id} className="border-b align-top">
                  <td className="p-2 font-mono text-xs">
                    {p.project_number ?? "—"}
                  </td>
                  <td className="font-semibold">{p.name}</td>
                  <td>{p.client_company}</td>
                  <td className="font-mono text-xs">
                    {quotation?.quotation_number ?? "—"}
                  </td>
                  <td>{personName(responsible)}</td>
                  <td>
                    <StatusBadge value={p.status} />
                  </td>
                  <td>
                    {p.actual_start_date || p.estimated_start_date
                      ? new Date(
                          p.actual_start_date ?? p.estimated_start_date!,
                        ).toLocaleDateString("es-CL", {
                          timeZone: "America/Santiago",
                        })
                      : "—"}
                  </td>
                  <td>
                    {p.estimated_end_date
                      ? new Date(p.estimated_end_date).toLocaleDateString(
                          "es-CL",
                          { timeZone: "America/Santiago" },
                        )
                      : "—"}
                  </td>
                  <td className="text-right">{clp.format(netIncome)}</td>
                  <td className="text-right">{clp.format(netExpenses)}</td>
                  <td
                    className={`text-right font-semibold ${result < 0 ? "text-red-600" : "text-emerald-700"}`}
                  >
                    {clp.format(result)}
                  </td>
                  <td>
                    {new Date(p.updated_at).toLocaleDateString("es-CL", {
                      timeZone: "America/Santiago",
                    })}
                  </td>
                  <td>
                    <Link
                      className="font-semibold text-[var(--oasis-primary)] underline"
                      href={`/sales/projects/${p.id}`}
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!projects.length && (
              <tr>
                <td colSpan={13} className="p-8 text-center text-[#63778e]">
                  No hay proyectos para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
