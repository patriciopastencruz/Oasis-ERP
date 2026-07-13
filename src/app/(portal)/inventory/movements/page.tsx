import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { InventoryTabs, number } from "@/modules/inventory/ui";
export default async function Page() {
  await requirePermission("inventory.materials.view");
  const s = await createSupabaseServerClient();
  const { data } = await s
    .from("inventory_movements")
    .select(
      "id,movement_date,movement_type,quantity_in,quantity_out,stock_after,document_reference,observation,inventory_materials(code,name,unit_of_measure),profiles!inventory_movements_created_by_fkey(first_name,last_name)",
    )
    .order("movement_date", { ascending: false })
    .limit(500);
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Historial de movimientos"
        description="Registro cronológico de entradas, consumos, fallas y stock resultante."
      />
      <InventoryTabs />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Material</th>
                <th>Movimiento</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Stock</th>
                <th>Observación</th>
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
                      {new Date(x.movement_date).toLocaleString("es-CL")}
                    </td>
                    <td>
                      <b>{m?.code}</b> · {m?.name}
                    </td>
                    <td>{x.document_reference}</td>
                    <td>{number(x.quantity_in)}</td>
                    <td>{number(x.quantity_out)}</td>
                    <td>
                      {number(x.stock_after)} {m?.unit_of_measure}
                    </td>
                    <td>{x.observation || "—"}</td>
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
