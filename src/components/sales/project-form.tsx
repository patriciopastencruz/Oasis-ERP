"use client";
import { clp } from "@/modules/sales/projects/domain/project";
import { inputClass } from "@/modules/sales/ui";

type Member = { id: string; first_name: string; last_name: string };

export function ProjectForm({
  action,
  submitLabel,
  members,
  quotation,
  initial,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  members: Member[];
  /** Presente solo cuando se está convirtiendo una cotización: los datos
   * comerciales quedan fijos (fotografía) y no se piden de nuevo. */
  quotation?: {
    id: string;
    quotation_number: string | null;
    client_company: string;
    client_place: string | null;
    net: number;
    iva: number;
    total: number;
  };
  initial?: {
    name?: string;
    description?: string;
    client_company?: string;
    client_rut?: string;
    client_contact?: string;
    client_email?: string;
    client_place?: string;
    execution_address?: string;
    responsible_id?: string;
    net_income?: number;
    estimated_start_date?: string;
    estimated_end_date?: string;
    notes?: string;
  };
}) {
  return (
    <form action={action} className="space-y-5">
      {quotation && (
        <input type="hidden" name="quotation_id" value={quotation.id} />
      )}

      {quotation ? (
        <div className="rounded-xl bg-[var(--oasis-soft)] p-4">
          <p className="text-xs font-semibold uppercase text-[#5b6d82]">
            Datos comerciales de la cotización {quotation.quotation_number}
          </p>
          <p className="mt-1 font-semibold">{quotation.client_company}</p>
          {quotation.client_place && (
            <p className="text-sm text-[#5b6d82]">{quotation.client_place}</p>
          )}
          <div className="mt-2 grid gap-1 text-sm sm:w-72">
            <div className="flex justify-between">
              <span className="text-[#5b6d82]">Ingreso neto</span>
              <span className="font-semibold">
                {clp.format(quotation.net)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5b6d82]">IVA referencial</span>
              <span>{clp.format(quotation.iva)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-bold">
              <span>Total comercial</span>
              <span>{clp.format(quotation.total)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#5b6d82]">
            Estos montos quedan fijos como fotografía del proyecto: si la
            cotización cambia después, el resultado histórico no se altera.
          </p>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 font-semibold">Cliente</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">
              Empresa
              <input
                className={inputClass}
                name="client_company"
                defaultValue={initial?.client_company}
                required
              />
            </label>
            <label className="text-sm font-medium">
              Rut
              <input
                className={inputClass}
                name="client_rut"
                defaultValue={initial?.client_rut}
              />
            </label>
            <label className="text-sm font-medium">
              Contacto
              <input
                className={inputClass}
                name="client_contact"
                defaultValue={initial?.client_contact}
              />
            </label>
            <label className="text-sm font-medium">
              Correo
              <input
                className={inputClass}
                name="client_email"
                type="email"
                defaultValue={initial?.client_email}
              />
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Lugar
              <input
                className={inputClass}
                name="client_place"
                defaultValue={initial?.client_place}
              />
            </label>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-semibold">Proyecto</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium md:col-span-2">
            Nombre del proyecto
            <input
              className={inputClass}
              name="name"
              defaultValue={
                initial?.name ??
                (quotation ? `Proyecto ${quotation.client_company}` : "")
              }
              required
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Descripción
            <textarea
              className={inputClass}
              name="description"
              rows={3}
              defaultValue={initial?.description}
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Dirección de ejecución o entrega
            <input
              className={inputClass}
              name="execution_address"
              defaultValue={
                initial?.execution_address ?? quotation?.client_place ?? ""
              }
            />
          </label>
          <label className="text-sm font-medium">
            Responsable
            <select
              className={inputClass}
              name="responsible_id"
              defaultValue={initial?.responsible_id}
              required
            >
              <option value="">Selecciona un responsable</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {`${m.first_name} ${m.last_name}`.trim()}
                </option>
              ))}
            </select>
          </label>
          {!quotation && (
            <label className="text-sm font-medium">
              Ingreso neto esperado (CLP)
              <input
                className={inputClass}
                name="net_income"
                type="number"
                min="0"
                step="1"
                defaultValue={initial?.net_income ?? 0}
                required
              />
            </label>
          )}
          <label className="text-sm font-medium">
            Fecha estimada de inicio
            <input
              className={inputClass}
              name="estimated_start_date"
              type="date"
              defaultValue={initial?.estimated_start_date}
            />
          </label>
          <label className="text-sm font-medium">
            Fecha estimada de término
            <input
              className={inputClass}
              name="estimated_end_date"
              type="date"
              defaultValue={initial?.estimated_end_date}
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Observaciones
            <textarea
              className={inputClass}
              name="notes"
              rows={3}
              defaultValue={initial?.notes}
            />
          </label>
        </div>
      </div>

      <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
        {submitLabel}
      </button>
    </form>
  );
}
