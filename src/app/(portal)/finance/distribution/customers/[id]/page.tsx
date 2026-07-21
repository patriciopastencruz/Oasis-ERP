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
import {
  createPriceAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "@/modules/finance/distribution/application/actions";
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

// Debe reflejar el mismo criterio que dist_resolve_price: entre precios
// vigentes, gana el más reciente (valid_from y luego created_at como
// desempate), sea general o específico del cliente.
function mostRecent(a: any, b: any) {
  if (!a) return b;
  if (!b) return a;
  if (a.valid_from !== b.valid_from) return a.valid_from > b.valid_from ? a : b;
  return (a.created_at ?? "") > (b.created_at ?? "") ? a : b;
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

  const [
    customerResult,
    productsResult,
    standardResult,
    customerPricesResult,
    classificationsResult,
  ] = await Promise.all([
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
      .select(
        "id,product_id,amount,valid_from,valid_until,active,deleted_at,created_at",
      )
      .eq("business_unit_id", unit.id)
      .is("customer_id", null)
      .order("valid_from", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("dist_prices")
      .select(
        "id,product_id,amount,valid_from,valid_until,active,deleted_at,change_reason,created_at,dist_products(code,name,presentation)",
      )
      .eq("business_unit_id", unit.id)
      .eq("customer_id", id)
      .order("valid_from", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("dist_customer_classifications")
      .select("id,name")
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .is("deleted_at", null)
      .order("display_order"),
  ]);

  const customer = customerResult.data;
  if (!customer) notFound();
  const products = productsResult.data ?? [];
  const standardPrices = standardResult.data ?? [];
  const customerPrices = customerPricesResult.data ?? [];
  const classifications = classificationsResult.data ?? [];
  const canManagePrices = ctx.permissions.has(
    "finance.distribution.catalogs.manage",
  );
  const canEditCustomer = ctx.permissions.has(
    "finance.distribution.customers.edit",
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
          className="text-sm font-semibold text-[var(--oasis-primary)]"
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

          {canEditCustomer && (
            <Panel>
              <h2 className="font-semibold">Editar cliente</h2>
              <p className="mt-1 text-xs leading-5 text-[#718078]">
                Los cambios comerciales quedan registrados en auditoría.
              </p>
              <form action={updateCustomerAction} className="mt-4 space-y-3">
                <input type="hidden" name="customer_id" value={customer.id} />
                <label className="block text-sm">
                  Nombre
                  <input
                    className={inputClass}
                    name="name"
                    defaultValue={customer.name}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Dirección
                  <input
                    className={inputClass}
                    name="address"
                    defaultValue={customer.address}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Teléfono
                  <input
                    className={inputClass}
                    name="phone"
                    defaultValue={customer.phone}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Correo
                  <input
                    className={inputClass}
                    name="email"
                    type="email"
                    defaultValue={customer.email ?? ""}
                  />
                </label>
                <label className="block text-sm">
                  Clasificación
                  <select
                    className={inputClass}
                    name="classification_id"
                    defaultValue={customer.classification_id}
                    required
                  >
                    {classifications.map((classification) => (
                      <option key={classification.id} value={classification.id}>
                        {classification.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Estado
                  <select
                    className={inputClass}
                    name="status"
                    defaultValue={customer.status}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="suspended">Suspendido</option>
                  </select>
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="has_credit"
                    defaultChecked={customer.has_credit}
                  />
                  Tiene crédito autorizado
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">
                    Límite
                    <input
                      className={inputClass}
                      name="credit_limit"
                      type="number"
                      min="0"
                      defaultValue={customer.credit_limit}
                    />
                  </label>
                  <label className="text-sm">
                    Días
                    <input
                      className={inputClass}
                      name="credit_days"
                      type="number"
                      min="0"
                      max="365"
                      defaultValue={customer.credit_days}
                    />
                  </label>
                </div>
                <button className={buttonClass}>Guardar cambios</button>
              </form>
            </Panel>
          )}

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

          {canEditCustomer && (
            <Panel className="border-red-200">
              <details>
                <summary className="cursor-pointer font-semibold text-red-700">
                  Eliminar cliente
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#718078]">
                  El cliente dejará de estar disponible para nuevos pedidos. Sus
                  pedidos, pagos y precios históricos se conservarán.
                </p>
                <form action={deleteCustomerAction} className="mt-4 space-y-3">
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="confirm_delete"
                      value="yes"
                      required
                    />
                    Confirmo que deseo eliminar a {customer.name}.
                  </label>
                  <button className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">
                    Eliminar cliente
                  </button>
                </form>
              </details>
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
                  const applied = mostRecent(general, special);
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
                      <td className="font-semibold text-[var(--oasis-primary)]">
                        {special ? clp.format(Number(special.amount)) : "—"}
                      </td>
                      <td className="font-semibold">
                        {applied
                          ? clp.format(Number(applied.amount))
                          : "Sin precio"}
                      </td>
                      <td>
                        {!applied
                          ? "—"
                          : applied === special
                            ? "Cliente"
                            : "General"}
                      </td>
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
