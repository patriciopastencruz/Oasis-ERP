import { PageHeader, Panel } from "@/components/ui/page";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { EditUserForm } from "@/components/admin/edit-user-form";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { toggleUserAction } from "@/modules/platform/admin/application/actions";

export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    q?: string;
    status?: string;
    edit?: string;
  }>;
}) {
  await requirePermission("administration.users.manage");
  const q = await searchParams;
  const s = await createSupabaseServerClient();
  let query = s
    .from("profiles")
    .select(
      "id,first_name,last_name,email,job_title,active,last_sign_in_at,created_at,roles(name)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (q.q)
    query = query.or(
      `first_name.ilike.%${q.q}%,last_name.ilike.%${q.q}%,email.ilike.%${q.q}%`,
    );
  if (q.status === "active") query = query.eq("active", true);
  if (q.status === "inactive") query = query.eq("active", false);
  const [
    { data: users },
    { data: roles },
    { data: companies },
    { data: units },
    { data: editUser },
  ] = await Promise.all([
    query,
    s.from("roles").select("id,name").eq("active", true),
    s.from("companies").select("id,trade_name").eq("active", true),
    s.from("business_units").select("id,name").eq("active", true),
    q.edit
      ? s
          .from("profiles")
          .select(
            "id,first_name,last_name,email,phone,job_title,role_id,user_companies(company_id),user_business_units(business_unit_id)",
          )
          .eq("id", q.edit)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Creación inmediata y administración segura de accesos."
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
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q.q}
          placeholder="Nombre o correo"
          className="rounded-xl border bg-white px-4 py-2"
        />
        <select
          name="status"
          defaultValue={q.status}
          className="rounded-xl border bg-white px-4 py-2"
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <button className="rounded-xl bg-[#173f2d] px-4 py-2 text-white">
          Filtrar
        </button>
      </form>
      {editUser && (
        <Panel className="mb-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              Editar {editUser.first_name} {editUser.last_name}
            </h2>
            <Link href="/admin/users" className="text-sm text-[#277a55]">
              Cerrar
            </Link>
          </div>
          <EditUserForm
            user={{
              ...editUser,
              company_ids: editUser.user_companies.map((x) => x.company_id),
              unit_ids: editUser.user_business_units.map(
                (x) => x.business_unit_id,
              ),
            }}
            roles={(roles ?? []).map((x) => ({ id: x.id, name: x.name }))}
            companies={(companies ?? []).map((x) => ({
              id: x.id,
              name: x.trade_name,
            }))}
            units={units ?? []}
          />
        </Panel>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Cargo</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users?.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="py-4">
                      <b>
                        {u.first_name} {u.last_name}
                      </b>
                      <small className="block">{u.email}</small>
                    </td>
                    <td>
                      {(Array.isArray(u.roles) ? u.roles[0] : u.roles)?.name}
                    </td>
                    <td>{u.job_title}</td>
                    <td>{u.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/users?edit=${u.id}`}
                          className="text-xs font-semibold text-[#277a55]"
                        >
                          Editar
                        </Link>
                        <form action={toggleUserAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={String(!u.active)}
                          />
                          <button className="text-xs font-semibold text-[#277a55]">
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-1 font-semibold">Crear usuario</h2>
          <p className="mb-4 text-xs text-slate-500">
            Quedará activo inmediatamente y podrá ingresar con la contraseña
            inicial.
          </p>
          <CreateUserForm
            roles={(roles ?? []).map((x) => ({ id: x.id, name: x.name }))}
            companies={(companies ?? []).map((x) => ({
              id: x.id,
              name: x.trade_name,
            }))}
            units={units ?? []}
          />
        </Panel>
      </div>
    </>
  );
}
