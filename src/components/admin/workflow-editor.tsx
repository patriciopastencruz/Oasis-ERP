"use client";
import { useState } from "react";
import { uiLabel } from "@/lib/ui-labels";
type Role = { id: string; name: string };
type Company = { id: string; trade_name: string };
type Unit = { id: string; company_id: string; name: string };
type Step = {
  id?: string;
  name: string;
  sequence_order: number;
  parallel_group: number;
  execution_mode: "sequential" | "parallel";
  required_role_id: string;
  is_required: boolean;
  allow_higher_role_substitution: boolean;
  require_comment: boolean;
  require_additional_attachment: boolean;
};
const input = "w-full rounded-lg border px-3 py-2 text-sm";
export function WorkflowEditor({
  action,
  roles,
  companies,
  units,
  initial,
}: {
  action: (form: FormData) => void | Promise<void>;
  roles: Role[];
  companies: Company[];
  units: Unit[];
  initial?: Record<string, unknown>;
}) {
  const firstCompany = String(initial?.company_id ?? companies[0]?.id ?? "");
  const initialSteps = (initial?.steps as Step[] | undefined) ?? [
    {
      name: "Aprobación",
      sequence_order: 1,
      parallel_group: 1,
      execution_mode: "sequential",
      required_role_id: roles[0]?.id ?? "",
      is_required: true,
      allow_higher_role_substitution: false,
      require_comment: false,
      require_additional_attachment: false,
    },
  ];
  const company = firstCompany;
  const [steps, setSteps] = useState(initialSteps);
  const update = (i: number, key: keyof Step, value: unknown) =>
    setSteps((s) => s.map((x, n) => (n === i ? { ...x, [key]: value } : x)));
  return (
    <form action={action} className="space-y-3">
      {Boolean(initial?.id) && (
        <input type="hidden" name="id" value={String(initial?.id)} />
      )}
      <input
        name="code"
        defaultValue={String(initial?.code ?? "")}
        placeholder="Código"
        className={input}
        required
      />
      <input
        name="name"
        defaultValue={String(initial?.name ?? "")}
        placeholder="Nombre"
        className={input}
        required
      />
      <textarea
        name="description"
        defaultValue={String(initial?.description ?? "")}
        placeholder="Descripción"
        className={input}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="company_id" value={company} />
        <select
          name="business_unit_id"
          defaultValue={String(initial?.business_unit_id ?? "")}
          className={input}
        >
          {units
            .filter((u) => u.company_id === company)
            .map((u) => (
              <option value={u.id} key={u.id}>
                {u.name}
              </option>
            ))}
        </select>
        <input
          name="min_amount"
          type="number"
          min="0"
          defaultValue={String(initial?.min_amount ?? 0)}
          className={input}
        />
        <input
          name="max_amount"
          type="number"
          min="1"
          defaultValue={String(initial?.max_amount ?? "")}
          placeholder="Sin máximo"
          className={input}
        />
        <select
          name="request_type"
          defaultValue={String(initial?.request_type ?? "")}
          className={input}
        >
          <option value="">Cualquier tipo</option>
          {[
            "supplier_payment",
            "reimbursement",
            "petty_cash",
            "advance",
            "other",
          ].map((x) => (
            <option key={x} value={x}>
              {uiLabel(x)}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={String(initial?.priority ?? "")}
          className={input}
        >
          <option value="">Cualquier prioridad</option>
          {["urgent", "normal", "scheduled"].map((x) => (
            <option key={x} value={x}>
              {uiLabel(x)}
            </option>
          ))}
        </select>
        <input
          name="valid_from"
          type="date"
          defaultValue={String(
            initial?.valid_from ?? new Date().toISOString().slice(0, 10),
          )}
          className={input}
        />
        <input
          name="valid_until"
          type="date"
          defaultValue={String(initial?.valid_until ?? "")}
          className={input}
        />
        <input
          name="priority_order"
          type="number"
          min="0"
          defaultValue={String(initial?.priority_order ?? 100)}
          className={input}
        />
        <select
          name="correction_policy"
          defaultValue={String(initial?.correction_policy ?? "restart_all")}
          className={input}
        >
          <option value="restart_all">Reiniciar todo</option>
          <option value="resume_current">Continuar etapa</option>
        </select>
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <fieldset className="rounded-xl border p-3" key={step.id ?? i}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={step.name}
                onChange={(e) => update(i, "name", e.target.value)}
                className={input}
                placeholder="Etapa"
              />
              <select
                value={step.required_role_id}
                onChange={(e) => update(i, "required_role_id", e.target.value)}
                className={input}
              >
                {roles.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={step.sequence_order}
                onChange={(e) =>
                  update(i, "sequence_order", Number(e.target.value))
                }
                className={input}
              />
              <select
                value={step.execution_mode}
                onChange={(e) => update(i, "execution_mode", e.target.value)}
                className={input}
              >
                <option value="sequential">Secuencial</option>
                <option value="parallel">Paralela</option>
              </select>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {[
                ["is_required", "Obligatoria"],
                ["allow_higher_role_substitution", "Permite sustitución"],
                ["require_comment", "Comentario"],
                ["require_additional_attachment", "Respaldo"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(step[key as keyof Step])}
                    onChange={(e) =>
                      update(i, key as keyof Step, e.target.checked)
                    }
                  />{" "}
                  {label}
                </label>
              ))}
            </div>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => setSteps((s) => s.filter((_, n) => n !== i))}
                className="mt-2 text-xs text-red-700"
              >
                Eliminar etapa
              </button>
            )}
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setSteps((s) => [
            ...s,
            {
              name: "Nueva etapa",
              sequence_order: s.length + 1,
              parallel_group: 1,
              execution_mode: "sequential",
              required_role_id: roles[0]?.id ?? "",
              is_required: true,
              allow_higher_role_substitution: false,
              require_comment: false,
              require_additional_attachment: false,
            },
          ])
        }
        className="text-sm font-semibold text-[#0b4f9c]"
      >
        + Agregar etapa
      </button>
      <input type="hidden" name="steps_json" value={JSON.stringify(steps)} />
      <button className="w-full rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white">
        Guardar flujo de aprobación
      </button>
    </form>
  );
}
