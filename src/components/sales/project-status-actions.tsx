import {
  allowedProjectStatusTransitions,
  type ProjectStatus,
} from "@/modules/sales/projects/domain/project";
import { uiLabel } from "@/lib/ui-labels";
import { inputClass } from "@/modules/sales/ui";
import { ConfirmButton } from "@/components/sales/confirm-button";
import {
  cancelProjectAction,
  changeProjectStatusAction,
  closeProjectAction,
  reopenProjectAction,
} from "@/modules/sales/projects/application/actions";

export function ProjectStatusActions({
  projectId,
  status,
  canUpdate,
  canClose,
  canReopen,
  canCancel,
}: {
  projectId: string;
  status: ProjectStatus;
  canUpdate: boolean;
  canClose: boolean;
  canReopen: boolean;
  canCancel: boolean;
}) {
  const nextStatuses = allowedProjectStatusTransitions[status];
  const isOpen = status !== "done" && status !== "cancelled";

  return (
    <div className="space-y-4">
      {canUpdate && isOpen && nextStatuses.length > 0 && (
        <form
          action={changeProjectStatusAction}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <label className="text-sm font-medium">
            Avanzar estado
            <select
              className={inputClass}
              name="target_status"
              defaultValue={nextStatuses[0]}
            >
              {nextStatuses.map((next) => (
                <option key={next} value={next}>
                  {uiLabel(next)}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--oasis-primary)]">
            Actualizar estado
          </button>
        </form>
      )}

      {canClose && isOpen && (
        <form
          action={closeProjectAction}
          className="space-y-2 rounded-xl border p-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <p className="text-sm font-semibold">Cerrar proyecto</p>
          <label className="block text-sm font-medium">
            Fecha real de término
            <input
              className={inputClass}
              type="date"
              name="actual_end_date"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Observación final
            <textarea
              className={inputClass}
              name="closure_notes"
              rows={3}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Recepción conforme (opcional)
            <input
              className={inputClass}
              type="file"
              name="receipt_file"
              accept="application/pdf,image/jpeg,image/png"
            />
          </label>
          <label className="block text-sm font-medium">
            Factura o documento equivalente (opcional)
            <input
              className={inputClass}
              type="file"
              name="invoice_file"
              accept="application/pdf,image/jpeg,image/png"
            />
          </label>
          <ConfirmButton
            className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white"
            message="¿Confirmas el cierre de este proyecto? Quedará principalmente de solo lectura."
          >
            Cerrar proyecto
          </ConfirmButton>
        </form>
      )}

      {canCancel && isOpen && (
        <form
          action={cancelProjectAction}
          className="space-y-2 rounded-xl border border-red-200 p-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <p className="text-sm font-semibold text-red-700">
            Cancelar proyecto
          </p>
          <label className="block text-sm font-medium">
            Motivo de cancelación
            <textarea className={inputClass} name="reason" rows={2} required />
          </label>
          <ConfirmButton
            className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white"
            message="¿Confirmas la cancelación de este proyecto? Debes indicar el motivo."
          >
            Cancelar proyecto
          </ConfirmButton>
        </form>
      )}

      {canReopen && status === "done" && (
        <form
          action={reopenProjectAction}
          className="space-y-2 rounded-xl border p-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <p className="text-sm font-semibold">Reabrir proyecto</p>
          <label className="block text-sm font-medium">
            Comentario (opcional)
            <textarea className={inputClass} name="comment" rows={2} />
          </label>
          <ConfirmButton
            className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--oasis-primary)]"
            message="¿Confirmas reabrir este proyecto? Requiere permiso especial."
          >
            Reabrir proyecto
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
