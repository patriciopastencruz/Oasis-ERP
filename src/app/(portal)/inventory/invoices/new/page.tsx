import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { registerInvoiceAction } from "@/modules/inventory/application/actions";
import {
  Field,
  inputClass,
  Notice,
  paymentMethodLabels,
} from "@/modules/inventory/ui";
import { InvoiceLines } from "@/components/inventory/invoice-lines";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams,
    ctx = await requirePermission("inventory.purchases.create"),
    s = await createSupabaseServerClient(),
    unitIds = ctx.units
      .filter(
        (x) => x.code === "OM" || x.name.toLowerCase().includes("modular"),
      )
      .map((x) => x.id);
  const [{ data: materials }, { data: suppliers }] = await Promise.all([
    s
      .from("inventory_materials")
      .select("id,code,name,current_stock,unit_of_measure,business_unit_id")
      .in(
        "business_unit_id",
        unitIds.length ? unitIds : ctx.units.map((x) => x.id),
      )
      .eq("status", "active")
      .order("name"),
    s
      .from("suppliers")
      .select("id,company_id,legal_name,rut")
      .eq("active", true)
      .order("legal_name"),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Inventario · Oasis Modulares"
        title="Ingreso de factura"
        description="Al confirmar, el stock y los precios se actualizarán automáticamente."
      />
      <Notice {...p} />
      <Panel>
        <form action={registerInvoiceAction} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="hidden"
              name="company_id"
              value={ctx.companies[0]?.id}
            />
            <Field label="Unidad">
              <select name="business_unit_id" required className={inputClass}>
                <option value="">Selecciona</option>
                {ctx.units
                  .filter((x) => unitIds.includes(x.id) || !unitIds.length)
                  .map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Número de factura">
              <input name="invoice_number" required className={inputClass} />
            </Field>
            <Field label="Proveedor">
              <select name="supplier_id" required className={inputClass}>
                <option value="">Selecciona</option>
                {suppliers?.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.legal_name} · {x.rut}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de compra">
              <input
                name="purchase_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </Field>
            <Field label="Método de pago">
              <select name="payment_method" required className={inputClass}>
                <option value="">Selecciona</option>
                {Object.entries(paymentMethodLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Factura adjunta">
              <input
                name="attachment"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className={inputClass}
              />
            </Field>
          </div>
          <InvoiceLines materials={materials ?? []} />
          <Field label="Observaciones">
            <textarea
              name="observations"
              maxLength={500}
              className={inputClass}
            />
          </Field>
          <button className="w-full rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white">
            Confirmar ingreso
          </button>
        </form>
      </Panel>
    </>
  );
}
