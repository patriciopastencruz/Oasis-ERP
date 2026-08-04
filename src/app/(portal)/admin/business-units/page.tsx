import { PageHeader, Panel } from "@/components/ui/page";
import { Field, Submit } from "@/components/ui/auth-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  saveUnitAction,
  toggleUnitAction,
} from "@/modules/platform/admin/application/actions";
export default async function Units() {
  await requirePermission("administration.business_units.manage");
  const s = await createSupabaseServerClient();
  const [{ data }, { data: company }] = await Promise.all([
    s
      .from("business_units")
      .select("id,code,name,active,color,company_id")
      .order("name"),
    s
      .from("companies")
      .select("id")
      .eq("code", "OASIS")
      .eq("active", true)
      .single(),
  ]);
  return (
    <>
      <PageHeader
        title="Unidades de negocio"
        description="Crear y administrar las unidades de negocio."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-4">
          {data?.map((u) => (
            <Panel key={u.id}>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full border"
                  style={{ backgroundColor: u.color ?? "#d5dce4" }}
                />
                <b>{u.name}</b>
              </div>
              <p className="text-xs">{u.code}</p>
              <form
                action={saveUnitAction}
                className="mt-3 flex items-center gap-2"
              >
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="company_id" value={u.company_id} />
                <input type="hidden" name="code" value={u.code} />
                <input type="hidden" name="name" value={u.name} />
                <label className="text-xs font-medium">
                  Color
                  <input
                    type="color"
                    name="color"
                    defaultValue={u.color ?? "#0b4f9c"}
                    className="ml-2 h-7 w-10 rounded border p-0.5"
                  />
                </label>
                <button className="text-xs font-semibold text-[#0b4f9c]">
                  Guardar color
                </button>
              </form>
              <form action={toggleUnitAction} className="mt-2">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="active" value={String(!u.active)} />
                <button className="text-xs font-semibold text-[#0b4f9c]">
                  {u.active ? "Desactivar" : "Activar"}
                </button>
              </form>
            </Panel>
          ))}
        </div>
        <Panel>
          <h2 className="mb-4 font-semibold">Nueva unidad</h2>
          <form action={saveUnitAction} className="space-y-3">
            <input type="hidden" name="company_id" value={company?.id} />
            <Field label="Código" name="code" />
            <Field label="Nombre" name="name" />
            <Field
              label="Color"
              name="color"
              type="color"
              required={false}
              defaultValue="#0b4f9c"
            />
            <Submit>Crear unidad</Submit>
          </form>
        </Panel>
      </div>
    </>
  );
}
