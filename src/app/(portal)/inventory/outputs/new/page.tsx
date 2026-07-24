import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { registerOutputAction } from "@/modules/inventory/application/actions";
import { Field, inputClass, Notice, number } from "@/modules/inventory/ui";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams,
    ctx = await requirePermission("inventory.outputs.create"),
    s = await createSupabaseServerClient(),
    units = ctx.units.filter(
      (x) => x.code === "OM" || x.name.toLowerCase().includes("modular"),
    );
  const { data: materials } = await s
    .from("inventory_materials")
    .select("id,code,name,current_stock,unit_of_measure,business_unit_id")
    .in(
      "business_unit_id",
      (units.length ? units : ctx.units).map((x) => x.id),
    )
    .eq("status", "active")
    .order("name");
  return (
    <>
      <PageHeader
        eyebrow="Inventario · Oasis Modulares"
        title="Registrar salida"
        description="El sistema rechazará cualquier operación que deje stock negativo."
      />
      <Notice {...p} />
      <Panel>
        <form
          action={registerOutputAction}
          className="grid gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="company_id" value={ctx.companies[0]?.id} />
          <Field label="Unidad">
            <select name="business_unit_id" required className={inputClass}>
              <option value="">Selecciona</option>
              {(units.length ? units : ctx.units).map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha">
            <input
              name="output_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Material">
            <select name="material_id" required className={inputClass}>
              <option value="">Busca por código o nombre</option>
              {materials?.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.code} · {x.name} · Disponible: {number(x.current_stock)}{" "}
                  {x.unit_of_measure}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad">
            <input
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Tipo de salida">
            <select name="output_type" required className={inputClass}>
              <option value="operational_consumption">
                Consumo operacional
              </option>
              <option value="loss">Falla o pérdida</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Motivo u observación (obligatorio para falla o pérdida)">
              <textarea name="reason" maxLength={500} className={inputClass} />
            </Field>
          </div>
          <button className="rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white md:col-span-2">
            Confirmar salida
          </button>
        </form>
      </Panel>
    </>
  );
}
