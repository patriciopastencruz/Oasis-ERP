import { PageHeader, Panel } from "@/components/ui/page";
import { TaskBoard } from "@/components/tasks/task-board";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listCompanyMembers,
  listCompanyUnits,
  loadBoard,
  tasksContext,
} from "@/modules/tasks/application/queries";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const ctx = await tasksContext();
  const params = await searchParams;
  const companyId =
    ctx.companies.find((company) => company.id === params.company)?.id ??
    ctx.companies[0]?.id;

  if (!companyId)
    return (
      <>
        <PageHeader
          title="Tablero de tareas"
          description="Organiza tareas internas por responsable y plazo."
          eyebrow="Gestión transversal"
        />
        <Panel>
          <p className="text-sm text-slate-500">
            No tienes ninguna compañía asignada.
          </p>
        </Panel>
      </>
    );

  const supabase = await createSupabaseServerClient();
  const [cards, members, units] = await Promise.all([
    loadBoard(companyId),
    listCompanyMembers(supabase, companyId),
    listCompanyUnits(supabase, companyId),
  ]);

  return (
    <>
      <PageHeader
        title="Tablero de tareas"
        description="Asigna tareas con responsable y plazo, y muévelas entre Pendiente, En ejecución y Terminado."
        eyebrow="Gestión transversal"
      />
      {ctx.companies.length > 1 && (
        <form className="mb-4 flex items-center gap-2 text-sm">
          <label className="font-medium">Compañía</label>
          <select
            name="company"
            defaultValue={companyId}
            className="rounded-xl border bg-white px-3 py-2"
          >
            {ctx.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.trade_name}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[#083f7d] px-3 py-2 font-semibold text-white">
            Cambiar
          </button>
        </form>
      )}
      <TaskBoard
        companyId={companyId}
        cards={cards}
        members={members}
        units={units}
        currentUserId={ctx.user.id}
        canManage={ctx.permissions.has("tasks.board.manage")}
      />
    </>
  );
}
