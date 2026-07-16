/* eslint-disable @typescript-eslint/no-explicit-any */
import { CustomersTable } from "@/components/finance/distribution/customers-table";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { createCustomerAction } from "@/modules/finance/distribution/application/actions";
import {
  aggregateCustomerBalances,
  distributionContext,
  paidAmountsByOrder,
} from "@/modules/finance/distribution/application/queries";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await distributionContext();
  const canEditCustomers = ctx.permissions.has(
    "finance.distribution.customers.edit",
  );
  const [
    { data: classes },
    { data: customers },
    ordersResult,
    allocationsResult,
  ] = await Promise.all([
    supabase
      .from("dist_customer_classifications")
      .select("id,name")
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("dist_customers")
      .select("*,dist_customer_classifications(name)")
      .eq("business_unit_id", unit.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("dist_orders")
      .select("id,customer_id,delivery_date,total")
      .eq("business_unit_id", unit.id)
      .eq("payment_condition", "credit")
      .in("status", ["delivered", "partially_delivered"])
      .is("deleted_at", null),
    supabase
      .from("dist_payment_allocations")
      .select("order_id,amount,dist_payments!inner(status,business_unit_id)")
      .eq("dist_payments.business_unit_id", unit.id)
      .eq("dist_payments.status", "confirmed"),
  ]);
  const paidByOrder = paidAmountsByOrder(allocationsResult.data ?? []);
  const creditDaysById = new Map(
    (customers ?? []).map((c: any) => [c.id, Number(c.credit_days ?? 0)]),
  );
  const balances = aggregateCustomerBalances(
    ordersResult.data ?? [],
    paidByOrder,
    creditDaysById,
  );
  const rows = (customers ?? []).map((x: any) => ({
    id: x.id,
    code: x.code,
    name: x.name,
    address: x.address,
    phone: x.phone,
    classificationName: x.dist_customer_classifications?.name ?? "—",
    statusLabel: uiLabel(x.status),
    creditLabel: x.has_credit
      ? `${Number(x.credit_limit).toLocaleString("es-CL")} / ${x.credit_days} días`
      : "No",
    balance: balances.get(x.id)?.balance ?? 0,
    overdue: balances.get(x.id)?.overdue ?? 0,
    manageHref: `/finance/distribution/customers/${x.id}`,
    manageLabel: canEditCustomers
      ? "Editar y gestionar"
      : ctx.permissions.has("finance.distribution.catalogs.manage")
        ? "Gestionar precios"
        : "Ver detalle",
  }));
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Clientes"
        description="Maestro de clientes, clasificación y condiciones de crédito."
      />
      <Flash success={q.success} error={q.error} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 font-semibold">Nuevo cliente</h2>
          <form action={createCustomerAction} className="space-y-3">
            <label className="block text-sm">
              Nombre
              <input className={inputClass} name="name" required />
            </label>
            <label className="block text-sm">
              Dirección
              <input className={inputClass} name="address" required />
            </label>
            <label className="block text-sm">
              Teléfono
              <input className={inputClass} name="phone" required />
            </label>
            <label className="block text-sm">
              Correo
              <input className={inputClass} name="email" type="email" />
            </label>
            <label className="block text-sm">
              Clasificación
              <select className={inputClass} name="classification_id" required>
                {classes?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Estado
              <select className={inputClass} name="status">
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="suspended">Suspendido</option>
              </select>
            </label>
            <label className="flex gap-2 text-sm">
              <input type="checkbox" name="has_credit" />
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
                  defaultValue="0"
                />
              </label>
              <label className="text-sm">
                Días
                <input
                  className={inputClass}
                  name="credit_days"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
              </label>
            </div>
            <button className={buttonClass}>Crear cliente</button>
          </form>
        </Panel>
        <CustomersTable customers={rows} />
      </div>
    </>
  );
}
