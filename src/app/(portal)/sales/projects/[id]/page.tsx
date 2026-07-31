import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { Notice, ProjectTabs, inputClass } from "@/modules/sales/ui";
import { uiLabel } from "@/lib/ui-labels";
import {
  calcProjectResults,
  formatMargin,
  clp,
  projectExpenseCategories,
  projectDocumentTypes,
  projectMemberRoles,
} from "@/modules/sales/projects/domain/project";
import {
  loadProject,
  loadProjectExpenses,
  loadExpenseAttachments,
  loadProjectMembers,
  loadProjectDocuments,
  loadProjectContracts,
  loadProjectNotes,
  loadProjectStatusHistory,
  listUnitMembers,
  signProjectAttachment,
  projectDetailContext,
} from "@/modules/sales/projects/application/queries";
import { ProjectStatusActions } from "@/components/sales/project-status-actions";
import { ProjectExpenseForm } from "@/components/sales/project-expense-form";
import { ConfirmButton } from "@/components/sales/confirm-button";
import {
  updateProjectAction,
  setProjectResponsibleAction,
  addProjectMemberAction,
  removeProjectMemberAction,
  voidProjectExpenseAction,
  deleteExpenseAttachmentAction,
  uploadProjectDocumentAction,
  deleteProjectDocumentAction,
  saveProjectContractAction,
  generateProjectContractPdfAction,
  deleteProjectContractAction,
  addProjectNoteAction,
  deleteProjectNoteAction,
} from "@/modules/sales/projects/application/actions";

function personName(p: { first_name?: string; last_name?: string } | null) {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
  });
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
  });
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const tab = q.tab || "resumen";
  const { ctx, company, unit, supabase } = await projectDetailContext();
  const project = await loadProject(supabase, id);
  if (!project) notFound();

  const canUpdate = ctx.permissions.has("sales.projects.update");
  const canManageTeam = ctx.permissions.has("sales.projects.manage_team");
  const canManageExpenses = ctx.permissions.has(
    "sales.projects.manage_expenses",
  );
  const canManageDocuments = ctx.permissions.has(
    "sales.projects.manage_documents",
  );
  const canAddNotes = ctx.permissions.has("sales.projects.add_notes");
  const canClose = ctx.permissions.has("sales.projects.close");
  const canReopen = ctx.permissions.has("sales.projects.reopen");
  const canCancel = ctx.permissions.has("sales.projects.cancel");
  const isClosed = project.status === "done" || project.status === "cancelled";

  const [
    expenses,
    members,
    documents,
    contracts,
    notes,
    statusHistory,
    unitMembers,
  ] = await Promise.all([
    loadProjectExpenses(supabase, id),
    loadProjectMembers(supabase, id),
    loadProjectDocuments(supabase, id),
    loadProjectContracts(supabase, id),
    loadProjectNotes(supabase, id),
    loadProjectStatusHistory(supabase, id),
    listUnitMembers(supabase, company.id, unit.id),
  ]);

  const activeExpenses = expenses.filter((e) => e.status === "active");
  const netExpenses = activeExpenses.reduce(
    (sum, e) => sum + Number(e.net_amount),
    0,
  );
  const ivaExpenses = activeExpenses.reduce(
    (sum, e) => sum + Number(e.iva_amount),
    0,
  );
  const totalExpenses = activeExpenses.reduce(
    (sum, e) => sum + Number(e.total_amount),
    0,
  );
  const byCategory = projectExpenseCategories
    .map((category) => ({
      category,
      total: activeExpenses
        .filter((e) => e.category === category)
        .reduce((sum, e) => sum + Number(e.net_amount), 0),
    }))
    .filter((row) => row.total > 0);
  const results = calcProjectResults({
    netIncome: Number(project.net_income),
    netExpenses,
    ivaOnIncome: Number(project.iva_reference),
    ivaOnExpenses: ivaExpenses,
  });

  const attachments = await loadExpenseAttachments(
    supabase,
    activeExpenses.map((e) => e.id),
  );
  const signedAttachments = await Promise.all(
    attachments.map(async (a) => ({
      ...a,
      url: await signProjectAttachment(
        supabase,
        a.object_path,
        a.original_name,
      ),
    })),
  );
  const signedDocuments = await Promise.all(
    documents.map(async (d) => ({
      ...d,
      url: await signProjectAttachment(supabase, d.object_path, d.name),
    })),
  );
  const signedContracts = await Promise.all(
    contracts.map(async (c) => ({
      ...c,
      url: c.pdf_object_path
        ? await signProjectAttachment(
            supabase,
            c.pdf_object_path,
            `Contrato ${project.project_number ?? ""}.pdf`.trim(),
          )
        : null,
    })),
  );

  const summaryCards = [
    ["Ingreso neto", clp.format(results.netIncome)],
    ["Gastos netos", clp.format(results.netExpenses)],
    ["Resultado", clp.format(results.result)],
    ["Margen", formatMargin(results.marginPercent)],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow={`Oasis Modulares · ${project.project_number ?? "Proyecto"}`}
        title={project.name}
        description={project.client_company}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge value={project.status} />
        {project.quotation && (
          <Link
            href={`/sales/quotations/${project.quotation.id}`}
            className="text-xs font-semibold text-[var(--oasis-primary)] underline"
          >
            Ver cotización de origen {project.quotation.quotation_number}
          </Link>
        )}
      </div>
      <ProjectTabs projectId={id} active={tab} />
      <Notice success={q.success} error={q.error} />

      {tab === "resumen" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(([label, value]) => (
              <Panel key={label}>
                <p className="text-xs text-[#5b6d82]">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </Panel>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel>
              <p className="text-xs text-[#5b6d82]">Responsable</p>
              <p className="mt-1 font-semibold">
                {personName(project.responsible)}
              </p>
              <p className="mt-3 text-xs text-[#5b6d82]">
                Fecha estimada de término
              </p>
              <p className="mt-1 font-semibold">
                {formatDate(project.estimated_end_date)}
              </p>
            </Panel>
            <Panel>
              <p className="text-xs text-[#5b6d82]">Datos generales</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#5b6d82]">Vendedor</dt>
                  <dd>{personName(project.seller)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6d82]">Creado por</dt>
                  <dd>{personName(project.creator)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6d82]">Fecha de creación</dt>
                  <dd>{formatDate(project.created_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6d82]">Inicio estimado</dt>
                  <dd>{formatDate(project.estimated_start_date)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6d82]">Inicio real</dt>
                  <dd>{formatDate(project.actual_start_date)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6d82]">Término real</dt>
                  <dd>{formatDate(project.actual_end_date)}</dd>
                </div>
              </dl>
            </Panel>
          </div>

          {project.status === "cancelled" && project.cancellation_reason && (
            <Panel className="border-red-200 bg-red-50">
              <p className="text-sm font-semibold text-red-800">
                Proyecto cancelado
              </p>
              <p className="mt-1 text-sm text-red-700">
                {project.cancellation_reason}
              </p>
            </Panel>
          )}
          {project.status === "done" && project.closure_notes && (
            <Panel className="bg-emerald-50">
              <p className="text-sm font-semibold text-emerald-800">
                Observación de cierre ({personName(project.closer)},{" "}
                {formatDate(project.closed_at)})
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                {project.closure_notes}
              </p>
            </Panel>
          )}

          {canUpdate && !isClosed && (
            <Panel>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Editar información general
                </summary>
                <form
                  action={updateProjectAction}
                  className="mt-4 grid gap-3 md:grid-cols-2"
                >
                  <input type="hidden" name="project_id" value={id} />
                  <label className="text-sm font-medium md:col-span-2">
                    Nombre
                    <input
                      className={inputClass}
                      name="name"
                      defaultValue={project.name}
                      required
                    />
                  </label>
                  <label className="text-sm font-medium md:col-span-2">
                    Descripción
                    <textarea
                      className={inputClass}
                      name="description"
                      rows={2}
                      defaultValue={project.description ?? ""}
                    />
                  </label>
                  {!project.quotation_id && (
                    <>
                      <label className="text-sm font-medium">
                        Cliente
                        <input
                          className={inputClass}
                          name="client_company"
                          defaultValue={project.client_company}
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Rut
                        <input
                          className={inputClass}
                          name="client_rut"
                          defaultValue={project.client_rut ?? ""}
                        />
                      </label>
                    </>
                  )}
                  <label className="text-sm font-medium">
                    Dirección de ejecución
                    <input
                      className={inputClass}
                      name="execution_address"
                      defaultValue={project.execution_address ?? ""}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Ingreso neto (CLP)
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      step="1"
                      name="net_income"
                      defaultValue={project.net_income}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Fecha estimada de inicio
                    <input
                      className={inputClass}
                      type="date"
                      name="estimated_start_date"
                      defaultValue={project.estimated_start_date ?? ""}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Fecha real de inicio
                    <input
                      className={inputClass}
                      type="date"
                      name="actual_start_date"
                      defaultValue={project.actual_start_date ?? ""}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Fecha estimada de término
                    <input
                      className={inputClass}
                      type="date"
                      name="estimated_end_date"
                      defaultValue={project.estimated_end_date ?? ""}
                    />
                  </label>
                  <label className="text-sm font-medium md:col-span-2">
                    Observaciones generales
                    <textarea
                      className={inputClass}
                      name="notes"
                      rows={2}
                      defaultValue={project.notes ?? ""}
                    />
                  </label>
                  <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2">
                    Guardar cambios
                  </button>
                </form>
              </details>
            </Panel>
          )}

          {(canUpdate || canClose || canReopen || canCancel) && (
            <Panel>
              <p className="mb-3 text-sm font-semibold">Acciones</p>
              <ProjectStatusActions
                projectId={id}
                status={project.status}
                canUpdate={canUpdate}
                canClose={canClose}
                canReopen={canReopen}
                canCancel={canCancel}
              />
            </Panel>
          )}

          <Panel>
            <p className="mb-3 text-sm font-semibold">Historial de estado</p>
            <ul className="space-y-2 text-sm">
              {statusHistory.map((h) => (
                <li key={h.id} className="border-b pb-2 last:border-0">
                  <p>
                    {h.from_status ? `${uiLabel(h.from_status)} → ` : ""}
                    <span className="font-semibold">
                      {uiLabel(h.to_status)}
                    </span>
                    {" — "}
                    {personName(h.changer)}, {formatDateTime(h.changed_at)}
                  </p>
                  {h.comment && <p className="text-[#5b6d82]">{h.comment}</p>}
                </li>
              ))}
              {!statusHistory.length && (
                <li className="text-[#5b6d82]">Sin movimientos registrados.</li>
              )}
            </ul>
          </Panel>
        </div>
      )}

      {tab === "gastos" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Panel>
              <p className="text-xs text-[#5b6d82]">Cantidad de gastos</p>
              <p className="mt-1 text-xl font-semibold">
                {activeExpenses.length}
              </p>
            </Panel>
            <Panel>
              <p className="text-xs text-[#5b6d82]">Total neto</p>
              <p className="mt-1 text-xl font-semibold">
                {clp.format(netExpenses)}
              </p>
            </Panel>
            <Panel>
              <p className="text-xs text-[#5b6d82]">IVA total</p>
              <p className="mt-1 text-xl font-semibold">
                {clp.format(ivaExpenses)}
              </p>
            </Panel>
            <Panel>
              <p className="text-xs text-[#5b6d82]">Total con IVA</p>
              <p className="mt-1 text-xl font-semibold">
                {clp.format(totalExpenses)}
              </p>
            </Panel>
          </div>

          <Panel>
            <p className="mb-2 text-sm font-semibold">Desglose por categoría</p>
            <ul className="space-y-1 text-sm">
              {byCategory.map((row) => (
                <li key={row.category} className="flex justify-between">
                  <span>{uiLabel(row.category)}</span>
                  <span className="font-semibold">{clp.format(row.total)}</span>
                </li>
              ))}
              {!byCategory.length && (
                <li className="text-[#5b6d82]">Sin gastos registrados.</li>
              )}
            </ul>
          </Panel>

          {canManageExpenses && !isClosed && (
            <ProjectExpenseForm projectId={id} />
          )}

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-[#63778e]">
                  <th className="p-2">Fecha</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Proveedor</th>
                  <th>Documento</th>
                  <th className="text-right">Neto</th>
                  <th className="text-right">IVA</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                  <th>Respaldo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const files = signedAttachments.filter(
                    (a) => a.expense_id === e.id,
                  );
                  return (
                    <tr
                      key={e.id}
                      className={`border-b align-top ${e.status === "voided" ? "opacity-50" : ""}`}
                    >
                      <td className="p-2">{formatDate(e.expense_date)}</td>
                      <td>{uiLabel(e.category)}</td>
                      <td>{e.description}</td>
                      <td>{e.supplier_name ?? "—"}</td>
                      <td>
                        {uiLabel(e.document_type)}
                        {e.document_number ? ` · ${e.document_number}` : ""}
                      </td>
                      <td className="text-right">
                        {clp.format(Number(e.net_amount))}
                      </td>
                      <td className="text-right">
                        {clp.format(Number(e.iva_amount))}
                      </td>
                      <td className="text-right font-semibold">
                        {clp.format(Number(e.total_amount))}
                      </td>
                      <td>
                        <StatusBadge value={e.status} />
                        {e.status === "voided" && e.void_reason && (
                          <p className="text-xs text-[#5b6d82]">
                            {e.void_reason}
                          </p>
                        )}
                      </td>
                      <td>
                        {files.map((f) => (
                          <div key={f.id}>
                            {f.url ? (
                              <a
                                className="text-xs font-semibold text-[var(--oasis-primary)] underline"
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {f.original_name}
                              </a>
                            ) : (
                              <span className="text-xs">{f.original_name}</span>
                            )}
                            {canManageExpenses && !isClosed && (
                              <form
                                action={deleteExpenseAttachmentAction}
                                className="inline"
                              >
                                <input
                                  type="hidden"
                                  name="attachment_id"
                                  value={f.id}
                                />
                                <input
                                  type="hidden"
                                  name="project_id"
                                  value={id}
                                />
                                <ConfirmButton
                                  className="ml-1 text-xs text-red-700"
                                  message="¿Eliminar este respaldo?"
                                >
                                  Eliminar
                                </ConfirmButton>
                              </form>
                            )}
                          </div>
                        ))}
                      </td>
                      <td>
                        {canManageExpenses &&
                          !isClosed &&
                          e.status === "active" && (
                            <form action={voidProjectExpenseAction}>
                              <input
                                type="hidden"
                                name="expense_id"
                                value={e.id}
                              />
                              <input
                                type="hidden"
                                name="project_id"
                                value={id}
                              />
                              <input
                                type="hidden"
                                name="reason"
                                value="Anulado desde la ficha del proyecto"
                              />
                              <ConfirmButton
                                className="text-xs font-semibold text-red-700"
                                message="¿Anular este gasto? Quedará excluido de los totales."
                              >
                                Anular
                              </ConfirmButton>
                            </form>
                          )}
                      </td>
                    </tr>
                  );
                })}
                {!expenses.length && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-[#63778e]">
                      No hay gastos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "resultados" && (
        <Panel>
          <p className="mb-4 text-sm font-semibold">Estado de resultados</p>
          <div className="max-w-md space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Ingreso neto</span>
              <span className="font-semibold">
                {clp.format(results.netIncome)}
              </span>
            </div>
            <p className="pt-2 text-xs font-semibold uppercase text-[#5b6d82]">
              Gastos
            </p>
            {byCategory.map((row) => (
              <div key={row.category} className="flex justify-between pl-2">
                <span>{uiLabel(row.category)}</span>
                <span className="text-red-600">−{clp.format(row.total)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Gastos netos totales</span>
              <span className="text-red-600">
                −{clp.format(results.netExpenses)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <span>Resultado del proyecto</span>
              <span className={results.result < 0 ? "text-red-600" : ""}>
                {clp.format(results.result)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>Margen</span>
              <span>{formatMargin(results.marginPercent)}</span>
            </div>
            <p className="pt-3 text-xs text-[#5b6d82]">
              El IVA nunca se mezcla con el margen operativo — se informa
              aparte, solo como referencia.
            </p>
            <div className="flex justify-between pt-1 text-xs text-[#5b6d82]">
              <span>IVA de la venta (referencial)</span>
              <span>{clp.format(results.ivaOnIncome)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#5b6d82]">
              <span>IVA de los gastos</span>
              <span>{clp.format(results.ivaOnExpenses)}</span>
            </div>
          </div>
        </Panel>
      )}

      {tab === "equipo" && (
        <div className="space-y-4">
          <Panel>
            <p className="mb-2 text-sm font-semibold">Responsable</p>
            <p className="mb-3">{personName(project.responsible)}</p>
            {canManageTeam && !isClosed && (
              <form
                action={setProjectResponsibleAction}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="project_id" value={id} />
                <label className="text-sm font-medium">
                  Cambiar responsable
                  <select
                    className={inputClass}
                    name="responsible_id"
                    defaultValue={project.responsible_id}
                  >
                    {unitMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {personName(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--oasis-primary)]">
                  Guardar
                </button>
              </form>
            )}
          </Panel>

          <Panel>
            <p className="mb-2 text-sm font-semibold">Integrantes</p>
            <ul className="mb-4 space-y-2 text-sm">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span>
                    {m.member_type === "user"
                      ? personName(m.profile)
                      : m.external_name}{" "}
                    <span className="text-[#5b6d82]">· {uiLabel(m.role)}</span>
                    {m.note && (
                      <span className="text-[#5b6d82]"> — {m.note}</span>
                    )}
                  </span>
                  {canManageTeam && !isClosed && (
                    <form action={removeProjectMemberAction}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <input type="hidden" name="project_id" value={id} />
                      <ConfirmButton
                        className="text-xs font-semibold text-red-700"
                        message="¿Quitar a este integrante del equipo?"
                      >
                        Quitar
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
              {!members.length && (
                <li className="text-[#5b6d82]">
                  No hay integrantes adicionales.
                </li>
              )}
            </ul>

            {canManageTeam && !isClosed && (
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  + Agregar integrante
                </summary>
                <form
                  action={addProjectMemberAction}
                  className="mt-4 grid gap-3 md:grid-cols-2"
                >
                  <input type="hidden" name="project_id" value={id} />
                  <label className="text-sm font-medium">
                    Tipo
                    <select className={inputClass} name="member_type" required>
                      <option value="user">Usuario del sistema</option>
                      <option value="external">Colaborador externo</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Rol
                    <select className={inputClass} name="role" required>
                      {projectMemberRoles.map((r) => (
                        <option key={r} value={r}>
                          {uiLabel(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Usuario (si es del sistema)
                    <select className={inputClass} name="profile_id">
                      <option value="">—</option>
                      {unitMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {personName(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Nombre (si es externo)
                    <input className={inputClass} name="external_name" />
                  </label>
                  <label className="text-sm font-medium md:col-span-2">
                    Observación (opcional)
                    <input className={inputClass} name="note" />
                  </label>
                  <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2">
                    Agregar
                  </button>
                </form>
              </details>
            )}
          </Panel>
        </div>
      )}

      {tab === "contrato" && (
        <div className="space-y-4">
          <Panel className="bg-amber-50">
            <p className="text-sm text-amber-900">
              Cada contrato es un borrador editable: escribe el texto, guárdalo,
              y genera (o regenera) su PDF cuando quede listo. El PDF es solo
              para imprimir y firmar — una vez firmado junto al cliente, súbelo
              en la pestaña Documentos como la versión oficial.
            </p>
          </Panel>

          {canManageDocuments && !isClosed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                + Nuevo contrato
              </summary>
              <form
                action={saveProjectContractAction}
                className="mt-4 grid gap-3 md:grid-cols-2"
              >
                <input type="hidden" name="project_id" value={id} />
                <label className="text-sm font-medium">
                  Ciudad del contrato
                  <input
                    className={inputClass}
                    name="contract_city"
                    defaultValue="Calama"
                  />
                </label>
                <label className="text-sm font-medium">
                  Fecha del contrato
                  <input
                    className={inputClass}
                    type="date"
                    name="contract_date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Actividades y alcance (una por línea; se numeran
                  automáticamente como a), b), c)…)
                  <textarea
                    className={inputClass}
                    name="activities"
                    rows={5}
                    required
                    defaultValue={[
                      project.quotation
                        ? `Realizar el suministro e instalación de los productos y/o servicios detallados en la cotización N° ${project.quotation.quotation_number ?? ""}, la cual es parte íntegra del presente contrato.`
                        : "Realizar el suministro e instalación de los productos y/o servicios acordados con el cliente.",
                      "La entrega comprende la instalación terminada (armado) de dichos productos.",
                      "El Cliente declara estar en conocimiento de que los productos entregados corresponden a una estructura estándar según lo pactado; cualquier modificación adicional deberá solicitarse por escrito y cotizarse aparte.",
                      `La entrega material se realizará en el sitio del cliente ubicado en ${project.execution_address || "dirección a definir"}.`,
                      `El plazo de ejecución comenzará el ${formatDate(project.estimated_start_date) === "—" ? "una fecha a definir" : formatDate(project.estimated_start_date)}, día en que se iniciarán los trabajos de este contrato.`,
                    ].join("\n")}
                  />
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Forma de pago (una por línea; se numeran automáticamente como
                  a), b)…)
                  <textarea
                    className={inputClass}
                    name="payment_terms"
                    rows={2}
                    required
                    defaultValue={`Un pago inicial de ${clp.format(Number(project.net_income) / 2)} y el saldo de ${clp.format(Number(project.net_income) / 2)} el primer día hábil de trabajo de la empresa.`}
                  />
                </label>
                <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2">
                  Guardar borrador de contrato
                </button>
              </form>
            </details>
          )}

          <div className="space-y-3">
            {signedContracts.map((c) => (
              <Panel key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {c.contract_number ?? "Contrato sin número asignado"} —{" "}
                      {formatDate(c.contract_date)} — {c.contract_city}
                    </p>
                    <p className="text-xs text-[#5b6d82]">
                      {c.pdf_object_path
                        ? `PDF generado el ${formatDateTime(c.pdf_generated_at!)}`
                        : "Todavía no se ha generado el PDF."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.url && (
                      <a
                        className="rounded-xl border px-3 py-1.5 text-xs font-semibold text-[var(--oasis-primary)]"
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Descargar PDF
                      </a>
                    )}
                    {canManageDocuments && !isClosed && (
                      <form action={generateProjectContractPdfAction}>
                        <input type="hidden" name="project_id" value={id} />
                        <input type="hidden" name="contract_id" value={c.id} />
                        <button className="rounded-xl bg-[var(--oasis-primary)] px-3 py-1.5 text-xs font-semibold text-white">
                          {c.pdf_object_path ? "Regenerar PDF" : "Generar PDF"}
                        </button>
                      </form>
                    )}
                    {canManageDocuments && !isClosed && (
                      <form action={deleteProjectContractAction}>
                        <input type="hidden" name="project_id" value={id} />
                        <input type="hidden" name="contract_id" value={c.id} />
                        <ConfirmButton
                          className="text-xs font-semibold text-red-700"
                          message="¿Eliminar este contrato? También se eliminará su PDF generado."
                        >
                          Eliminar
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>

                {canManageDocuments && !isClosed && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--oasis-primary)]">
                      Editar
                    </summary>
                    <form
                      action={saveProjectContractAction}
                      className="mt-3 grid gap-3 md:grid-cols-2"
                    >
                      <input type="hidden" name="project_id" value={id} />
                      <input type="hidden" name="contract_id" value={c.id} />
                      <label className="text-sm font-medium">
                        Ciudad del contrato
                        <input
                          className={inputClass}
                          name="contract_city"
                          defaultValue={c.contract_city}
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Fecha del contrato
                        <input
                          className={inputClass}
                          type="date"
                          name="contract_date"
                          defaultValue={c.contract_date}
                        />
                      </label>
                      <label className="text-sm font-medium md:col-span-2">
                        Actividades y alcance
                        <textarea
                          className={inputClass}
                          name="activities"
                          rows={5}
                          required
                          defaultValue={c.activities}
                        />
                      </label>
                      <label className="text-sm font-medium md:col-span-2">
                        Forma de pago
                        <textarea
                          className={inputClass}
                          name="payment_terms"
                          rows={2}
                          required
                          defaultValue={c.payment_terms}
                        />
                      </label>
                      <button className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--oasis-primary)] md:col-span-2">
                        Guardar cambios
                      </button>
                    </form>
                  </details>
                )}
              </Panel>
            ))}
            {!signedContracts.length && (
              <Panel>
                <p className="text-sm text-[#5b6d82]">
                  Todavía no hay contratos para este proyecto.
                </p>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === "documentos" && (
        <div className="space-y-4">
          {canManageDocuments && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                + Subir documento
              </summary>
              <form
                action={uploadProjectDocumentAction}
                className="mt-4 grid gap-3 md:grid-cols-2"
              >
                <input type="hidden" name="project_id" value={id} />
                <label className="text-sm font-medium">
                  Tipo de documento
                  <select className={inputClass} name="document_type" required>
                    {projectDocumentTypes.map((t) => (
                      <option key={t} value={t}>
                        {uiLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Nombre
                  <input className={inputClass} name="name" required />
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Descripción (opcional)
                  <input className={inputClass} name="description" />
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Archivo (PDF/JPG/PNG hasta 10MB)
                  <input
                    className={inputClass}
                    type="file"
                    name="document"
                    accept="application/pdf,image/jpeg,image/png"
                    required
                  />
                </label>
                <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2">
                  Subir documento
                </button>
              </form>
            </details>
          )}

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-[#63778e]">
                  <th className="p-2">Tipo</th>
                  <th>Nombre</th>
                  <th>Subido por</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {signedDocuments.map((d) => (
                  <tr key={d.id} className="border-b">
                    <td className="p-2">{uiLabel(d.document_type)}</td>
                    <td>
                      {d.url ? (
                        <a
                          className="font-semibold text-[var(--oasis-primary)] underline"
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {d.name}
                        </a>
                      ) : (
                        d.name
                      )}
                      {d.description && (
                        <p className="text-xs text-[#5b6d82]">
                          {d.description}
                        </p>
                      )}
                    </td>
                    <td>{personName(d.uploader)}</td>
                    <td>{formatDate(d.created_at)}</td>
                    <td>
                      {canManageDocuments && (
                        <form action={deleteProjectDocumentAction}>
                          <input
                            type="hidden"
                            name="document_id"
                            value={d.id}
                          />
                          <input type="hidden" name="project_id" value={id} />
                          <ConfirmButton
                            className="text-xs font-semibold text-red-700"
                            message="¿Eliminar este documento?"
                          >
                            Eliminar
                          </ConfirmButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {!signedDocuments.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[#63778e]">
                      No hay documentos subidos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "observaciones" && (
        <div className="space-y-4">
          {canAddNotes && !isClosed && (
            <Panel>
              <form action={addProjectNoteAction} className="space-y-2">
                <input type="hidden" name="project_id" value={id} />
                <label className="block text-sm font-medium">
                  Nueva observación
                  <textarea
                    className={inputClass}
                    name="body"
                    rows={3}
                    required
                  />
                </label>
                <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
                  Registrar
                </button>
              </form>
            </Panel>
          )}
          <Panel>
            <ul className="space-y-3 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#5b6d82]">
                      {formatDateTime(n.created_at)} · {personName(n.author)}
                      {n.edited_at ? " (editada)" : ""}
                    </p>
                    {canAddNotes &&
                      n.author?.id === ctx.user.id &&
                      !isClosed && (
                        <form action={deleteProjectNoteAction}>
                          <input type="hidden" name="note_id" value={n.id} />
                          <input type="hidden" name="project_id" value={id} />
                          <ConfirmButton
                            className="text-xs font-semibold text-red-700"
                            message="¿Eliminar esta observación?"
                          >
                            Eliminar
                          </ConfirmButton>
                        </form>
                      )}
                  </div>
                  <p className="mt-1">{n.body}</p>
                </li>
              ))}
              {!notes.length && (
                <li className="text-[#5b6d82]">
                  Todavía no hay observaciones registradas.
                </li>
              )}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
