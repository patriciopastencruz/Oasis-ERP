import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { InventoryTabs, Notice, number } from "@/modules/inventory/ui";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const p = await searchParams,
    ctx = await requirePermission("inventory.materials.view"),
    s = await createSupabaseServerClient();
  const { data } = await s
    .from("inventory_outputs")
    .select(
      "id,output_date,quantity,output_type,reason,stock_before,stock_after,inventory_materials(code,name,unit_of_measure),profiles!inventory_outputs_recorded_by_fkey(first_name,last_name)",
    )
    .order("recorded_at", { ascending: false });
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Salidas de materiales"
        description="Consumos operacionales, fallas y pérdidas registradas."
      />
      <InventoryTabs />
      <Notice {...p} />
      {ctx.permissions.has("inventory.outputs.create") && (
        <Link
          href="/inventory/outputs/new"
          className="mb-4 inline-block rounded-xl bg-[#173f2d] px-4 py-2.5 text-white"
        >
          Registrar salida
        </Link>
      )}
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Material</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Stock anterior</th>
                <th>Stock posterior</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((x) => {
                const m = Array.isArray(x.inventory_materials)
                  ? x.inventory_materials[0]
                  : x.inventory_materials;
                return (
                  <tr key={x.id} className="border-t">
                    <td className="py-4">
                      {new Date(`${x.output_date}T12:00:00`).toLocaleDateString(
                        "es-CL",
                      )}
                    </td>
                    <td>
                      <b>{m?.code}</b> · {m?.name}
                    </td>
                    <td>
                      {x.output_type === "loss"
                        ? "Falla o pérdida"
                        : "Consumo operacional"}
                    </td>
                    <td>
                      {number(x.quantity)} {m?.unit_of_measure}
                    </td>
                    <td>{number(x.stock_before)}</td>
                    <td>{number(x.stock_after)}</td>
                    <td>{x.reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
