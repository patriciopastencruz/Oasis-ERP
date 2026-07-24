import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  InventoryTabs,
  Notice,
  money,
  paymentMethodLabels,
} from "@/modules/inventory/ui";
import { inventorySignedUrl } from "@/modules/inventory/application/actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const p = await searchParams,
    ctx = await requirePermission("inventory.materials.view"),
    s = await createSupabaseServerClient();
  const { data } = await s
    .from("inventory_purchase_invoices")
    .select(
      "id,invoice_number,purchase_date,payment_method,entered_at,attachment_path,attachment_name,suppliers(legal_name),profiles!inventory_purchase_invoices_entered_by_fkey(first_name,last_name),inventory_purchase_lines(quantity,line_total)",
    )
    .order("purchase_date", { ascending: false });
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Facturas de compra"
        description="Compras registradas y respaldos asociados."
      />
      <InventoryTabs />
      <Notice {...p} />
      {ctx.permissions.has("inventory.purchases.create") && (
        <Link
          href="/inventory/invoices/new"
          className="mb-4 inline-block rounded-xl bg-[#083f7d] px-4 py-2.5 text-white"
        >
          Ingresar factura
        </Link>
      )}
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Método de pago</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Respaldo</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((x) => (
                <tr key={x.id} className="border-t">
                  <td className="py-4 font-semibold">{x.invoice_number}</td>
                  <td>
                    {
                      (Array.isArray(x.suppliers)
                        ? x.suppliers[0]
                        : x.suppliers
                      )?.legal_name
                    }
                  </td>
                  <td>
                    {new Date(`${x.purchase_date}T12:00:00`).toLocaleDateString(
                      "es-CL",
                    )}
                  </td>
                  <td>
                    {paymentMethodLabels[x.payment_method] ?? x.payment_method}
                  </td>
                  <td>{x.inventory_purchase_lines?.length || 0}</td>
                  <td>
                    {money(
                      x.inventory_purchase_lines?.reduce(
                        (a, l) => a + Number(l.line_total),
                        0,
                      ),
                    )}
                  </td>
                  <td>
                    {x.attachment_path ? (
                      <form
                        action={inventorySignedUrl.bind(
                          null,
                          "inventory-invoices",
                          x.attachment_path,
                        )}
                      >
                        <button className="font-semibold text-[#0b4f9c]">
                          {x.attachment_name || "Abrir"}
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
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
