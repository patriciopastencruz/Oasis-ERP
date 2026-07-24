/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { createPriceAction } from "@/modules/finance/distribution/application/actions";
import {
  clp,
  distributionContext,
} from "@/modules/finance/distribution/application/queries";
export default async function Catalogs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await distributionContext();
  const [{ data: products }, { data: customers }, { data: prices }] =
    await Promise.all([
      supabase
        .from("dist_products")
        .select("*,dist_product_categories(name)")
        .eq("business_unit_id", unit.id)
        .order("display_order"),
      supabase
        .from("dist_customers")
        .select("id,code,name")
        .eq("business_unit_id", unit.id)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("dist_prices")
        .select("*,dist_products(name),dist_customers(name)")
        .eq("business_unit_id", unit.id)
        .eq("active", true)
        .order("valid_from", { ascending: false }),
    ]);
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Productos y precios"
        description="Catálogo estructurado e historial de precios estándar o por cliente."
      />
      <Flash success={q.success} error={q.error} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 font-semibold">Nueva vigencia de precio</h2>
          <form action={createPriceAction} className="space-y-3">
            <label className="block text-sm">
              Producto
              <select className={inputClass} name="product_id" required>
                {products?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Cliente (vacío = estándar)
              <select className={inputClass} name="customer_id">
                <option value="">Precio estándar</option>
                {customers?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Precio CLP
              <input
                className={inputClass}
                name="amount"
                type="number"
                min="0"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                Desde
                <input
                  className={inputClass}
                  name="valid_from"
                  type="date"
                  defaultValue={new Date().toLocaleDateString("en-CA", {
                    timeZone: "America/Santiago",
                  })}
                  required
                />
              </label>
              <label className="text-sm">
                Hasta
                <input className={inputClass} name="valid_until" type="date" />
              </label>
            </div>
            <label className="block text-sm">
              Motivo
              <input className={inputClass} name="change_reason" required />
            </label>
            <button className={buttonClass}>Crear precio</button>
          </form>
        </Panel>
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-3 font-semibold">Productos</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {products?.map((x: any) => (
                <div key={x.id} className="rounded-xl border p-3">
                  <b>{x.name}</b>
                  <p className="text-xs text-[#63778e]">
                    {x.code} · {x.presentation} ·{" "}
                    {x.dist_product_categories?.name}
                    {Number(x.ice_weight_kg) > 0
                      ? ` · ${x.ice_weight_kg} kg`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-3 font-semibold">Precios vigentes</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Producto</th>
                  <th>Cliente / origen</th>
                  <th>Precio</th>
                  <th>Vigencia</th>
                </tr>
              </thead>
              <tbody>
                {prices?.map((x: any) => (
                  <tr key={x.id} className="border-b">
                    <td className="p-2">{x.dist_products?.name}</td>
                    <td>{x.dist_customers?.name ?? "Estándar"}</td>
                    <td className="font-semibold">
                      {clp.format(Number(x.amount))}
                    </td>
                    <td>
                      {x.valid_from}
                      {x.valid_until ? ` → ${x.valid_until}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}
