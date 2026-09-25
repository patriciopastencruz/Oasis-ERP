import { PageHeader, Panel } from "@/components/ui/page";
import {
  createCategoryAction,
  toggleCategoryAction,
} from "@/modules/finance/cash-flow/application/actions";
import {
  cashFlowContext,
  listCategories,
} from "@/modules/finance/cash-flow/application/queries";
import { CashFlowTabs, inputClass, Notice } from "@/modules/finance/cash-flow/ui";

export default async function CashFlowCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await cashFlowContext("finance.cash_flow.manage");
  const categories = await listCategories(supabase, unit.id);

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Categorías de flujo de caja"
        description="Clasificaciones disponibles para los ingresos y gastos de esta unidad. Desactivar una categoría la oculta al registrar, sin afectar los movimientos históricos."
      />
      <CashFlowTabs active="categories" canManage />
      <Notice success={q.success} error={q.error} />
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_340px]">
        {(["income", "expense"] as const).map((kind) => (
          <Panel key={kind}>
            <h2 className="mb-3 font-semibold">{kind === "income" ? "Ingresos" : "Gastos"}</h2>
            <ul className="divide-y text-sm">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2.5">
                    <span className={c.active ? "" : "text-slate-400 line-through"}>{c.name}</span>
                    <form action={toggleCategoryAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={String(!c.active)} />
                      <button className="text-xs font-semibold text-slate-600 hover:text-[var(--oasis-primary)]">
                        {c.active ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </li>
                ))}
            </ul>
          </Panel>
        ))}
        <Panel>
          <h2 className="mb-3 font-semibold">Nueva categoría</h2>
          <form action={createCategoryAction} className="space-y-3">
            <label className="block text-sm">
              Tipo
              <select name="kind" className={inputClass}>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
              </select>
            </label>
            <label className="block text-sm">
              Nombre
              <input name="name" required minLength={2} maxLength={80} className={inputClass} />
            </label>
            <button className="w-full rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
              Crear categoría
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}
