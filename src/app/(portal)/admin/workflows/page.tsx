import { PageHeader, Panel } from "@/components/ui/page";
import { WorkflowEditor } from "@/components/admin/workflow-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  duplicateWorkflowAction,
  saveWorkflowAction,
  toggleWorkflowAction,
} from "@/modules/platform/admin/application/actions";
export default async function Workflows({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requirePermission("administration.approval_rules.manage");
  const q = await searchParams;
  const s = await createSupabaseServerClient();
  const [{ data }, { data: roles }, { data: companies }, { data: units }] =
    await Promise.all([
      s
        .from("approval_workflows")
        .select(
          "*,business_units(name),approval_workflow_conditions(*),approval_workflow_steps(*)",
        )
        .order("name"),
      s.from("roles").select("id,name").eq("active", true),
      s.from("companies").select("id,trade_name").eq("active", true),
      s.from("business_units").select("id,company_id,name").eq("active", true),
    ]);
  return (
    <>
      <PageHeader
        title="Flujos de aprobación"
        description="Los cambios se aplican solo a solicitudes futuras; las instancias existentes permanecen congeladas."
      />
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}
      {q.success && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm">{q.success}</p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <div className="space-y-4">
          {data?.map((w) => {
            const condition = Array.isArray(w.approval_workflow_conditions)
              ? w.approval_workflow_conditions[0]
              : w.approval_workflow_conditions;
            return (
              <Panel key={w.id}>
                <div className="flex justify-between">
                  <div>
                    <b>{w.name}</b>
                    <p className="text-xs">
                      {w.code} ·{" "}
                      {
                        (Array.isArray(w.business_units)
                          ? w.business_units[0]
                          : w.business_units
                        )?.name
                      }
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={duplicateWorkflowAction}>
                      <input type="hidden" name="id" value={w.id} />
                      <button className="text-xs font-semibold">
                        Duplicar
                      </button>
                    </form>
                    <form action={toggleWorkflowAction}>
                      <input type="hidden" name="id" value={w.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(!w.active)}
                      />
                      <button className="text-xs font-semibold text-[#277a55]">
                        {w.active ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-2 text-xs">
                  {condition?.min_amount} –{" "}
                  {condition?.max_amount ?? "sin máximo"}
                </p>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Editar configuración
                  </summary>
                  <div className="mt-4">
                    <WorkflowEditor
                      action={saveWorkflowAction}
                      roles={roles ?? []}
                      companies={companies ?? []}
                      units={units ?? []}
                      initial={{
                        ...w,
                        ...condition,
                        steps: w.approval_workflow_steps,
                      }}
                    />
                  </div>
                </details>
              </Panel>
            );
          })}
        </div>
        <Panel>
          <h2 className="mb-4 font-semibold">Nuevo workflow</h2>
          <WorkflowEditor
            action={saveWorkflowAction}
            roles={roles ?? []}
            companies={companies ?? []}
            units={units ?? []}
          />
        </Panel>
      </div>
    </>
  );
}
