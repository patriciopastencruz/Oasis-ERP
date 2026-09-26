import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { listFinanceCategories } from "@/modules/lodging/application/monthly-queries";
import {
  createFinanceCategoryAction,
  toggleFinanceCategoryAction,
} from "@/modules/lodging/application/monthly-actions";
import { sectionLabels, sectionOrder } from "@/modules/lodging/domain/monthly-closing";

export default async function FinanceCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await lodgingContext("lodging.monthly_closing.manage");
  const categories = await listFinanceCategories(supabase, unit.id);
  const field = "mt-1 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2 text-sm";
  return (
    <>
      <Link href="/lodging/monthly" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Cierre mensual
      </Link>
      <PageHeader
        eyebrow={unit.name}
        title="Categorías financieras"
        description="Estructura del estado de resultados. Las marcadas como “gasto diario” aparecen al registrar gastos en el cierre diario de recepción."
      />
      {(q.error || q.success) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Panel>
          {sectionOrder.map((s) => (
            <section key={s} className="mb-4">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{sectionLabels[s]}</h2>
              <ul className="divide-y text-sm">
                {categories
                  .filter((c) => c.section === s)
                  .map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <span className={c.active ? "" : "text-slate-400 line-through"}>
                        {c.name}
                        {c.allow_daily && (
                          <span className="ml-2 rounded bg-[#e3f6ef] px-1.5 py-0.5 text-[10px] font-semibold text-[#137a55]">Gasto diario</span>
                        )}
                      </span>
                      <form action={toggleFinanceCategoryAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={String(!c.active)} />
                        <button className="text-xs font-semibold text-slate-600 hover:text-[#0b4f9c]">{c.active ? "Desactivar" : "Activar"}</button>
                      </form>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </Panel>
        <Panel className="h-fit">
          <h2 className="mb-3 font-semibold">Nueva categoría</h2>
          <form action={createFinanceCategoryAction} className="space-y-3">
            <label className="block text-sm">
              Sección
              <select name="section" className={field}>
                {sectionOrder.map((s) => (
                  <option key={s} value={s}>
                    {sectionLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Nombre
              <input name="name" required minLength={2} maxLength={80} className={field} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="allow_daily" /> Disponible para gastos del cierre diario
            </label>
            <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white">Crear categoría</button>
          </form>
        </Panel>
      </div>
    </>
  );
}
