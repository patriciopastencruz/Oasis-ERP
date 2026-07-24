import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { Field, Submit } from "@/components/ui/auth-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  saveRoleAction,
  toggleRoleAction,
} from "@/modules/platform/admin/application/actions";

const roleHelp: Record<string, string> = {
  superadmin:
    "Control total de la plataforma, configuración, seguridad y todos los módulos.",
  general_manager:
    "Supervisa las unidades, consulta reportes y participa en aprobaciones de alto nivel.",
  area_manager:
    "Gestiona la operación de sus unidades, proveedores, solicitudes y aprobaciones asignadas.",
  finance_manager:
    "Administra proveedores, programación, ejecución y control financiero de pagos.",
  administrator:
    "Gestiona la operación diaria, solicitudes, proveedores, categorías y caja chica.",
  worker:
    "Crea solicitudes de pago y consulta la información necesaria para su trabajo.",
};

const moduleNames: Record<string, string> = {
  administration: "Administración",
  audit: "Auditoría",
  finance: "Finanzas",
  reports: "Reportes",
  sales: "Ventas",
};

export default async function Roles({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; error?: string; success?: string }>;
}) {
  await requirePermission("administration.roles.manage");
  const q = await searchParams;
  const s = await createSupabaseServerClient();
  const [{ data: roles }, { data: permissions }] = await Promise.all([
    s
      .from("roles")
      .select(
        "id,key,name,description,is_system,active,role_permissions(permission_id,permissions(key,module,description))",
      )
      .order("name"),
    s
      .from("permissions")
      .select("id,key,module,description")
      .eq("active", true)
      .order("module")
      .order("key"),
  ]);
  const editing = roles?.find((role) => role.id === q.edit);
  const groupedPermissions = Object.entries(
    (permissions ?? []).reduce<Record<string, typeof permissions>>(
      (groups, permission) => {
        (groups[permission.module] ??= []).push(permission);
        return groups;
      },
      {},
    ),
  );

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Crear roles y asignar permisos configurables."
      />
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}
      {q.success && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {q.success}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-4">
          {roles?.map((role) => (
            <Panel key={role.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <b>{role.name}</b>
                  <p className="text-xs">{role.key}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/roles?edit=${role.id}`}
                    className="text-xs font-semibold text-[#0b4f9c]"
                  >
                    Editar
                  </Link>
                  <form action={toggleRoleAction}>
                    <input type="hidden" name="id" value={role.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={String(!role.active)}
                    />
                    <button className="text-xs font-semibold text-[#0b4f9c]">
                      {role.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </div>
              </div>
              {role.description && (
                <p className="mt-2 text-xs text-slate-600">
                  {role.description}
                </p>
              )}
              {!role.description && roleHelp[role.key] && (
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {roleHelp[role.key]}
                </p>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {role.role_permissions
                  .flatMap((item) => item.permissions ?? [])
                  .map((permission) => (
                    <span
                      className="rounded-lg bg-[#ebf1f7] px-3 py-2 text-xs leading-4"
                      key={permission.key}
                      title={permission.key}
                    >
                      {permission.description}
                    </span>
                  ))}
              </div>
            </Panel>
          ))}
        </div>
        <Panel className="h-fit xl:sticky xl:top-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              {editing ? `Editar ${editing.name}` : "Nuevo rol"}
            </h2>
            {editing && (
              <Link href="/admin/roles" className="text-sm text-[#0b4f9c]">
                Cancelar
              </Link>
            )}
          </div>
          <form
            key={editing?.id ?? "new-role"}
            action={saveRoleAction}
            className="space-y-3"
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="block text-sm font-medium">
              Key técnica
              <input
                name="key"
                required
                readOnly={Boolean(editing)}
                defaultValue={editing?.key}
                className={`mt-2 w-full rounded-xl border border-[#c9dbee] px-4 py-3 ${editing ? "bg-slate-50 text-slate-600" : "bg-white"}`}
              />
              {editing && (
                <span className="mt-1 block text-xs text-slate-500">
                  La key no se cambia porque identifica al rol internamente.
                </span>
              )}
            </label>
            <Field label="Nombre" name="name" defaultValue={editing?.name} />
            <Field
              label="Descripción"
              name="description"
              required={false}
              defaultValue={
                editing
                  ? (editing.description ?? roleHelp[editing.key] ?? "")
                  : ""
              }
            />
            <fieldset>
              <legend className="text-sm font-medium">Permisos</legend>
              <p className="mt-1 text-xs text-slate-500">
                Marca las acciones que podrán realizar los usuarios con este
                rol.
              </p>
              <div className="mt-3 max-h-[32rem] space-y-4 overflow-y-auto rounded-xl border p-3">
                {groupedPermissions.map(([module, items]) => (
                  <section key={module}>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0b4f9c]">
                      {moduleNames[module] ?? module}
                    </h3>
                    <div className="space-y-2">
                      {items?.map((permission) => (
                        <label
                          key={permission.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm hover:bg-[#f3f6f9]"
                        >
                          <input
                            type="checkbox"
                            name="permission_ids"
                            value={permission.id}
                            defaultChecked={editing?.role_permissions.some(
                              (item) => item.permission_id === permission.id,
                            )}
                            className="mt-1 size-4 accent-[#0b4f9c]"
                          />
                          <span>
                            <span className="block font-medium">
                              {permission.description}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              {permission.key}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </fieldset>
            {editing && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Los cambios se aplicarán a todos los usuarios que tengan el rol
                {` ${editing.name}`}.
              </p>
            )}
            <Submit>{editing ? "Guardar cambios" : "Crear rol"}</Submit>
          </form>
        </Panel>
      </div>
    </>
  );
}
