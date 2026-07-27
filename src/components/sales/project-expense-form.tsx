import {
  projectExpenseCategories,
  projectExpenseDocumentTypes,
} from "@/modules/sales/projects/domain/project";
import { uiLabel } from "@/lib/ui-labels";
import { inputClass } from "@/modules/sales/ui";
import { createProjectExpenseAction } from "@/modules/sales/projects/application/actions";

export function ProjectExpenseForm({ projectId }: { projectId: string }) {
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        + Registrar gasto
      </summary>
      <form
        action={createProjectExpenseAction}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <input type="hidden" name="project_id" value={projectId} />
        <label className="text-sm font-medium">
          Fecha
          <input
            className={inputClass}
            type="date"
            name="expense_date"
            required
          />
        </label>
        <label className="text-sm font-medium">
          Categoría
          <select className={inputClass} name="category" required>
            {projectExpenseCategories.map((c) => (
              <option key={c} value={c}>
                {uiLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Descripción
          <input className={inputClass} name="description" required />
        </label>
        <label className="text-sm font-medium">
          Proveedor (opcional)
          <input className={inputClass} name="supplier_name" />
        </label>
        <label className="text-sm font-medium">
          RUT proveedor (opcional)
          <input className={inputClass} name="supplier_rut" />
        </label>
        <label className="text-sm font-medium">
          Tipo de documento
          <select className={inputClass} name="document_type" required>
            {projectExpenseDocumentTypes.map((d) => (
              <option key={d} value={d}>
                {uiLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          N° de documento (opcional)
          <input className={inputClass} name="document_number" />
        </label>
        <label className="mt-6 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="is_exempt" />
          Documento exento de IVA
        </label>
        <label className="text-sm font-medium">
          Monto neto (CLP)
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            name="net_amount"
            required
          />
        </label>
        <label className="text-sm font-medium">
          Forma de pago (opcional)
          <input className={inputClass} name="payment_method" />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Observaciones
          <textarea className={inputClass} name="notes" rows={2} />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Respaldo (opcional, PDF/JPG/PNG hasta 10MB)
          <input
            className={inputClass}
            type="file"
            name="attachment"
            accept="application/pdf,image/jpeg,image/png"
          />
        </label>
        <p className="text-xs text-[#5b6d82] md:col-span-2">
          El IVA (19%) y el total se calculan automáticamente en el servidor
          — nunca se confía en lo que envía el navegador.
        </p>
        <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2">
          Guardar gasto
        </button>
      </form>
    </details>
  );
}
