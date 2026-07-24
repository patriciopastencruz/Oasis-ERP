import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uiLabel } from "@/lib/ui-labels";
import { inventoryContext } from "@/modules/inventory/application/queries";
import {
  InventoryTabs,
  Notice,
  money,
  number,
  inputClass,
} from "@/modules/inventory/ui";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; success?: string; error?: string }>;
}) {
  const p = await searchParams,
    { ctx, unit } = await inventoryContext("inventory.materials.view"),
    s = await createSupabaseServerClient();
  let q = s
    .from("inventory_materials")
    .select(
      "id,code,name,category,unit_of_measure,current_stock,average_price,status,business_units(name)",
    )
    .eq("business_unit_id", unit?.id ?? "")
    .order("name");
  if (p.q)
    q = q.or(`code.ilike.%${p.q}%,name.ilike.%${p.q}%,category.ilike.%${p.q}%`);
  const { data } = await q;
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Maestro de materiales"
        description="Consulta stock, precios y estado de los materiales de Oasis Modulares."
      />
      <InventoryTabs />
      <Notice {...p} />
      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={p.q}
            placeholder="Código, nombre o categoría"
            className={inputClass}
          />
          <button className="rounded-xl bg-[#083f7d] px-4 text-white">
            Buscar
          </button>
        </form>
        {ctx.permissions.has("inventory.materials.create") && (
          <Link
            href="/inventory/materials/new"
            className="rounded-xl bg-[#083f7d] px-4 py-2.5 text-white"
          >
            Nuevo material
          </Link>
        )}
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pb-3">Código</th>
                <th>Material</th>
                <th>Categoría</th>
                <th>Stock</th>
                <th>Precio promedio</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((x) => (
                <tr className="border-t" key={x.id}>
                  <td className="py-4 font-mono">{x.code}</td>
                  <td>
                    <b>{x.name}</b>
                    <small className="block">
                      {
                        (Array.isArray(x.business_units)
                          ? x.business_units[0]
                          : x.business_units
                        )?.name
                      }
                    </small>
                  </td>
                  <td>{x.category}</td>
                  <td>
                    {number(x.current_stock)} {x.unit_of_measure}
                  </td>
                  <td>{money(x.average_price)}</td>
                  <td>{uiLabel(x.status)}</td>
                  <td>
                    <Link
                      className="font-semibold text-[#0b4f9c]"
                      href={`/inventory/materials/${x.id}`}
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
