/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { createPriceAction } from "@/modules/finance/distribution/application/actions";
import {
  clp,
  distributionContext,
} from "@/modules/finance/distribution/application/queries";

function isCurrent(price: any, today: string) {
  return (
    price.active &&
    !price.deleted_at &&
    price.valid_from <= today &&
    (!price.valid_until || price.valid_until >= today)
  );
}

export default async function CustomerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { ctx, unit, supabase } = await distributionContext();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });

  const [customerResult, productsResult, standardResult, customerPricesResult] =
    await Promise.all([
      supabase
        .from("dist_customers")
        .select("*,dist_customer_classifications(name)")
        .eq("id", id)
        .eq("business_unit_id", unit.id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("dist_products")
        .select("id,code,name,presentation,display_order")
        .eq("business_unit_id", unit.id)
        .eq("active", true)
        .is("deleted_at", null)
        .order("display_order"),
      supabase
        .from("dist_prices")
        .select("id,product_id,amount,valid_from,valid_until,active,deleted_at")
        .eq("business_unit_id", unit.id)
        .is("customer_id", null)
        .order("valid_from", { ascending: false }),
      supabase
        .from("dist_prices")
        .select(
          "id,product_id,amount,valid_from,valid_until,active,deleted_at,change_reason,created_at,dist_products(code,name,presentation)",
        )
        .eq("business_unit_id", unit.id)
        .eq("customer_id", id)
        .order("valid_from", { ascending: false }),
    ]);

  const customer = customerResult.data;
  if (!customer) notFound();
  const products = productsResult.data ?? [];
  const standardPrices = standardResult.data ?? [];
  const customerPrices = customerPricesResult.data ?? [];
  const canManagePrices = ctx.permissions.has(
    "finance.distribution.catalogs.manage",
  );

  const currentStandard = new Map<string, any>();
  for (const price of standardPrices) {
    if (isCurrent(price, today) && !currentStandard.has(price.product_id))
      currentStandard.set(price.product_id, price);
  }
  const currentCustomer = new Map<string, any>();
  for (const price of customerPrices) {
    if (isCurrent(price, today) && !currentCustomer.has(price.product_id))
      currentCustomer.set(price.product_id, price);
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/finance/distribution/customers"
          className="text-sm font-semibold text-[#176b46]"
        >
          ← Volver a clientes
        </Link>
      </div>
      <PageHeader
        eyebrow="Distribuidora Altiplánica · Clientes"
        title={`${customer.code} · ${customer.name}`}
        description="Condiciones comerciales y precios específicos asignados a este cliente."
      />
      <Flash success={q.success} error={q.error} />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Panel>
            <h2 className="font-semibold">Ficha comercial</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-[#718078]">Dirección</dt>
                <dd className="mt-1 font-medium">{customer.address}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#718078]">Clasificación</dt>
                <dd className="mt-1 font-medium">
                  {customer.dist_customer_classifications?.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#718078]">Estado</dt>
                <dd className="mt-1 font-medium">{uiLabel(customer.status)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#718078]">Crédito</dt>
                <dd className="mt-1 font-medium">
                  {customer.has_credit
                    ? clp.format(Number(customer.credit_limit))
                    : "Sin crédito"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#718078]">Plazo</dt>
                <dd className="mt-1 font-medium">
                  {customer.has_credit ? `${customer.credit_days} días` : "—"}
                </dd>
              </div>
            </dl>
          </Panel>

          {canManagePrices ? (
            <Panel>
              <h2 className="font-semibold">Asignar precio al cliente</h2>
              <p className="mt-1 text-xs leading-5 text-[#718078]">
                Este precio tendrá prioridad sobre el precio general al crear
                pedidos para este cliente.
              </p>
              <form action={createPriceAction} className="mt-4 space-y-3">
                <input type="hidden" name="customer_id" value={customer.id} />
                <label className="block text-sm">
                  Producto
                  <select className={inputClass} name="product_id" required>
                    {products.map((product: any) => {
                      const general = currentStandard.get(product.id);
                      return (
                        <option key={product.id} value={product.id}>
                          {product.code} · {product.name}
                          {general
                            ? ` · General ${clp.format(Number(general.amount))}`
                            : " · Sin precio general"}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="block text-sm">
                  Precio especial CLP
                  <input
                    className={inputClass}
                    name="amount"
                    type="number"
                    min="0"
                    step="1"
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
                      defaultValue={today}
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Hasta
                    <input
                      className={inputClass}
                      name="valid_until"
                      type="date"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  Motivo del precio
                  <input
                    className={inputClass}
                    name="change_reason"
                    placeholder="Ej.: Acuerdo comercial mensual"
                    required
                  />
                </label>
                <button className={buttonClass}>Asignar precio</button>
              </form>
            </Panel>
          ) : (
            <Panel>
              <h2 className="font-semibold">Asignación de precios</h2>
              <p className="mt-2 text-sm text-[#718078]">
                Puedes consultar los precios del cliente. La asignación está
                reservada a roles con permiso para administrar precios.
              </p>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel className="overflow-x-auto">
            <h2 className="mb-3 font-semibold">Precio efectivo hoy</h2>
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Producto</th>
                  <th>Precio general</th>
                  <th>Precio cliente</th>
                  <th>Precio aplicado</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product: any) => {
                  const general = currentStandard.get(product.id);
                  const special = currentCustomer.get(product.id);
                  const applied = special ?? general;
                  return (
                    <tr key={product.id} className="border-b">
                      <td className="p-2">
                        <b>{product.name}</b>
                        <br />
                        <span className="font-mono text-xs text-[#718078]">
                          {product.code} · {product.presentation}
                        </span>
                      </td>
                      <td>
                        {general
                          ? clp.format(Number(general.amount))
                          : "Sin precio"}
                      </td>
                      <td className="font-semibold text-[#176b46]">
                        {special ? clp.format(Number(special.amount)) : "—"}
                      </td>
                      <td className="font-semibold">
                        {applied
                          ? clp.format(Number(applied.amount))
                          : "Sin precio"}
                      </td>
                      <td>{special ? "Cliente" : general ? "General" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel className="overflow-x-auto">
            <h2 className="mb-3 font-semibold">
              Historial de precios del cliente
            </h2>
            {customerPrices.length ? (
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Producto</th>
                    <th>Precio</th>
                    <th>Vigencia</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {customerPrices.map((price: any) => (
                    <tr key={price.id} className="border-b">
                      <td className="p-2">
                        {price.dist_products?.code} ·{" "}
                        {price.dist_products?.name}
                      </td>
                      <td className="font-semibold">
                        {clp.format(Number(price.amount))}
                      </td>
                      <td>
                        {price.valid_from}
                        {price.valid_until ? ` → ${price.valid_until}` : " → ∞"}
                      </td>
                      <td>
                        {isCurrent(price, today) ? "Vigente" : "Histórico"}
                      </td>
                      <td>{price.change_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[#718078]">
                Este cliente todavía no tiene precios específicos. Mientras
                tanto, sus pedidos utilizan los precios generales vigentes.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
