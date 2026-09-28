import Link from "next/link";
import { ClpInput } from "@/components/lodging/clp-input";
import { saveLineAction } from "@/modules/lodging/application/monthly-actions";
import { sectionLabels, sectionOrder, type FinanceCategory, type MonthlySummary } from "@/modules/lodging/domain/monthly-closing";

const field = "mt-1 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2 text-sm";

/** Agregar o editar una línea manual del cierre mensual (ingreso, costo, inversión, retiro u otro). */
export function MonthlyLineForm({
  month,
  closingId,
  categories,
  editing,
}: {
  month: string;
  closingId: string;
  categories: FinanceCategory[];
  editing?: MonthlySummary["lines"][number];
}) {
  const active = categories.filter((c) => c.active);
  return (
    <form action={saveLineAction} key={editing?.id ?? "new"} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="closing_id" value={closingId} />
      {editing && <input type="hidden" name="line_id" value={editing.id} />}
      <label className="block text-sm">
        Categoría
        <select name="category_id" required defaultValue={editing?.category_id ?? ""} className={field}>
          <option value="" disabled>
            Selecciona
          </option>
          {sectionOrder.map((s) => (
            <optgroup key={s} label={sectionLabels[s]}>
              {active
                .filter((c) => c.section === s)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Descripción
        <input name="description" required minLength={2} maxLength={160} defaultValue={editing?.description} placeholder="Ej.: Arriendo terreno" className={field} />
      </label>
      <label className="block text-sm">
        Monto
        <ClpInput name="amount" defaultValue={editing ? String(editing.amount) : ""} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Pagado por
          <input name="payer" maxLength={60} defaultValue={editing?.payer ?? ""} placeholder="oasis, Patricio…" className={field} />
        </label>
        <label className="block text-sm">
          Estado
          <select name="payment_status" defaultValue={editing?.payment_status ?? "pagado"} className={field}>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </label>
      </div>
      <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white">{editing ? "Guardar cambios" : "Agregar"}</button>
      {editing && (
        <Link href={`/lodging/monthly?month=${month}`} className="block text-center text-sm text-slate-500">
          Cancelar edición
        </Link>
      )}
    </form>
  );
}
