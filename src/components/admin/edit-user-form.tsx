import Link from "next/link";
import { updateUserAction } from "@/modules/platform/admin/application/actions";

type Item = { id: string; name: string };
type EditableUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_title: string;
  role_id: string;
  company_ids: string[];
  unit_ids: string[];
};

export function EditUserForm({
  user,
  roles,
  companies,
  units,
}: {
  user: EditableUser;
  roles: Item[];
  companies: Item[];
  units: Item[];
}) {
  const input = "mt-2 w-full rounded-xl border bg-white p-3";
  return (
    <form action={updateUserAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={user.id} />
      <Field label="Nombre" name="first_name" value={user.first_name} />
      <Field label="Apellido" name="last_name" value={user.last_name} />
      <label className="block text-sm">
        Correo
        <input
          name="email"
          type="email"
          value={user.email}
          readOnly
          className={`${input} bg-slate-50 text-slate-600`}
        />
      </label>
      <Field
        label="Teléfono"
        name="phone"
        value={user.phone ?? ""}
        required={false}
      />
      <Field label="Cargo" name="job_title" value={user.job_title} />
      <label className="block text-sm">
        Rol
        <select name="role_id" defaultValue={user.role_id} className={input}>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
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
          required
          name="unit_ids"
          defaultValue={user.unit_ids}
          className={`${input} h-40`}
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          Usa Cmd + clic en Mac o Ctrl + clic en Windows para seleccionar
          varias.
        </span>
      </label>
      <div className="flex items-end gap-2 md:col-span-2">
        <button className="rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white">
          Guardar cambios
        </button>
        <Link href="/admin/users" className="rounded-xl border px-4 py-3">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  required = true,
}: {
  label: string;
  name: string;
  value: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        defaultValue={value}
        required={required}
        className="mt-2 w-full rounded-xl border bg-white p-3"
      />
    </label>
  );
}
