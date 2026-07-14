"use client";
import { useActionState, useState } from "react";
import { createUserAction } from "@/modules/platform/admin/application/actions";
import type { UserActionResult } from "@/modules/platform/admin/application/user-schema";
type Item = { id: string; name: string };
export function CreateUserForm({
  roles,
  companies,
  units,
}: {
  roles: Item[];
  companies: Item[];
  units: Item[];
}) {
  const [state, action, pending] = useActionState(createUserAction, {
      success: false,
    } as UserActionResult),
    [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget,
      companyCount = new FormData(form)
        .getAll("company_ids")
        .filter(Boolean).length,
      unitCount = new FormData(form).getAll("unit_ids").filter(Boolean).length,
      errors: Record<string, string> = {};
    if (!companyCount)
      errors.company_ids =
        "No fue posible determinar la organización del usuario.";
    if (!unitCount)
      errors.unit_ids = "Debes asignar al menos una unidad de negocio.";
    setClientErrors(errors);
    if (Object.keys(errors).length) e.preventDefault();
  };
  const input = "mt-2 w-full rounded-xl border p-3";
  return (
    <form action={action} onSubmit={submit} className="space-y-3" noValidate>
      {state.message && (
        <p
          className={`rounded-xl p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
        >
          {state.message}
        </p>
      )}
      <F l="Nombre" n="first_name" />
      <F l="Apellido" n="last_name" />
      <F l="Correo" n="email" t="email" />
      <F
        l="Contraseña inicial"
        n="password"
        t="password"
        autoComplete="new-password"
      />
      <Error value={state.fieldErrors?.password?.[0]} />
      <F
        l="Confirmar contraseña"
        n="password_confirmation"
        t="password"
        autoComplete="new-password"
      />
      <Error value={state.fieldErrors?.password_confirmation?.[0]} />
      <F l="Teléfono" n="phone" required={false} />
      <F l="Cargo" n="job_title" />
      <label className="block text-sm">
        Rol
        <select name="role_id" className={input} required>
          {roles.map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {companies.map((company) => (
        <input
          key={company.id}
          type="hidden"
          name="company_ids"
          value={company.id}
        />
      ))}
      <label className="block text-sm">
        Unidades de negocio
        <select
          multiple
          name="unit_ids"
          className={`${input} h-32`}
          aria-describedby="unit-error"
        >
          {units.map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          Para acceso completo, selecciona todas las unidades usando Ctrl/Cmd +
          clic.
        </span>
        <Error
          id="unit-error"
          value={clientErrors.unit_ids ?? state.fieldErrors?.unit_ids?.[0]}
        />
      </label>
      <button
        disabled={pending}
        className="w-full rounded-xl bg-[#173f2d] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}
function F({
  l,
  n,
  t = "text",
  required = true,
  autoComplete,
}: {
  l: string;
  n: string;
  t?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm">
      {l}
      <input
        name={n}
        type={t}
        required={required}
        autoComplete={autoComplete}
        minLength={t === "password" ? 8 : undefined}
        className="mt-2 w-full rounded-xl border p-3"
      />
    </label>
  );
}
function Error({ id, value }: { id?: string; value?: string }) {
  return value ? (
    <span id={id} className="mt-1 block text-xs font-medium text-red-600">
      {value}
    </span>
  ) : null;
}
