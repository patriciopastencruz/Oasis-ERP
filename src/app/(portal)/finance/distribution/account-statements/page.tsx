/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { AccountStatementsResults } from "@/components/finance/distribution/account-statements-results";
import { inputClass } from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import {
  aggregateCustomerBalances,
  distributionContext,
  paidAmountsByOrder,
} from "@/modules/finance/distribution/application/queries";

const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(
        new Date(`${value.slice(0, 10)}T12:00:00Z`),
      )
    : "—";

export default async function AccountStatements({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await distributionContext(
    "finance.distribution.reports.view",
  );
  const [
    customersResult,
    classesResult,
    ordersResult,
    allocationsResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from("dist_customers")
      .select(
        "id,code,name,classification_id,has_credit,credit_limit,credit_days,credit_status,commercial_block,dist_customer_classifications(name)",
      )
      .eq("business_unit_id", unit.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("dist_customer_classifications")
      .select("id,name")
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("dist_orders")
      .select(
        "id,order_number,customer_id,created_at,delivery_date,total,payment_status,dist_order_lines(planned_quantity,delivered_quantity,dist_products(name,presentation))",
      )
      .eq("business_unit_id", unit.id)
      .eq("payment_condition", "credit")
      .in("status", ["delivered", "partially_delivered"])
      .is("deleted_at", null),
    supabase
      .from("dist_payment_allocations")
      .select("order_id,amount,dist_payments!inner(status,business_unit_id)")
      .eq("dist_payments.business_unit_id", unit.id)
      .eq("dist_payments.status", "confirmed"),
    supabase
      .from("dist_payments")
      .select("customer_id,paid_at")
      .eq("business_unit_id", unit.id)
      .eq("status", "confirmed")
      .not("customer_id", "is", null)
      .order("paid_at", { ascending: false }),
  ]);

  const error =
    customersResult.error ??
    classesResult.error ??
    ordersResult.error ??
    allocationsResult.error ??
    paymentsResult.error;
  if (error)
    throw new Error(`No se pudo calcular el estado de pago: ${error.message}`);

  const paidByOrder = paidAmountsByOrder(allocationsResult.data ?? []);
  const lastPaymentByCustomer = new Map<string, string>();
  for (const payment of paymentsResult.data ?? []) {
    if (payment.customer_id && !lastPaymentByCustomer.has(payment.customer_id))
      lastPaymentByCustomer.set(payment.customer_id, payment.paid_at);
  }
  const creditDaysById = new Map(
    (customersResult.data ?? []).map((c: any) => [
      c.id,
      Number(c.credit_days ?? 0),
    ]),
  );
  const aggregates = aggregateCustomerBalances(
    ordersResult.data ?? [],
    paidByOrder,
    creditDaysById,
  );

  const classification = q.classification ?? "all";
  const state = q.state ?? "debt";
  const filtered = (customersResult.data ?? [])
    .map((customer: any) => ({
      ...customer,
      ...(aggregates.get(customer.id) ?? {
        sold: 0,
        paid: 0,
        balance: 0,
        overdue: 0,
      }),
      lastPayment: lastPaymentByCustomer.get(customer.id),
    }))
    .filter((customer: any) => {
      const matchesClass =
        classification === "all" ||
        customer.classification_id === classification;
      const matchesState =
        state === "all" ||
        (state === "debt" && customer.balance > 0) ||
        (state === "overdue" && customer.overdue > 0) ||
        (state === "current" &&
          customer.balance > 0 &&
          customer.overdue === 0) ||
        (state === "paid" && customer.sold > 0 && customer.balance === 0);
      return matchesClass && matchesState;
    });

  const visibleCustomerIds = new Set(filtered.map((row: any) => row.id));
  const outstandingByCustomer = new Map<string, any[]>();
  for (const order of ordersResult.data ?? []) {
    if (!order.customer_id || !visibleCustomerIds.has(order.customer_id))
      continue;
    const balance = Math.max(
      0,
      Number(order.total) - (paidByOrder.get(order.id) ?? 0),
    );
    if (balance <= 0) continue;
    const list = outstandingByCustomer.get(order.customer_id) ?? [];
    list.push({ ...order, balance });
    outstandingByCustomer.set(order.customer_id, list);
  }

  const canExport = ctx.permissions.has("finance.distribution.reports.export");
  const rows = filtered.map((customer: any) => ({
    id: customer.id,
    code: customer.code,
    name: customer.name,
    classificationName: customer.dist_customer_classifications?.name ?? "—",
    sold: customer.sold,
    paid: customer.paid,
    balance: customer.balance,
    overdue: customer.overdue,
    dueLabel: dateLabel(customer.oldestDue ?? customer.nextDue),
    lastPaymentLabel: dateLabel(customer.lastPayment),
    orders: (outstandingByCustomer.get(customer.id) ?? []).map(
      (order: any) => ({
        id: order.id,
        orderNumber: order.order_number,
        date: dateLabel(order.created_at),
        products: (order.dist_order_lines ?? [])
          .map((line: any) => {
            const product = line.dist_products;
            const quantity = line.delivered_quantity ?? line.planned_quantity;
            return `${product?.name ?? "Producto"} (${quantity}${product?.presentation ? ` ${product.presentation}` : ""})`;
          })
          .join(", "),
        total: Number(order.total),
        balance: order.balance,
      }),
    ),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Estado de pago"
        description="Cartera por cliente, saldos vigentes, deuda vencida y estados de pago exportables."
      />
      <Panel className="mb-5">
        <form className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Clasificación
            <select
              className={inputClass}
              name="classification"
              defaultValue={classification}
            >
              <option value="all">Todas</option>
              {(classesResult.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Estado
            <select className={inputClass} name="state" defaultValue={state}>
              <option value="debt">Con saldo pendiente</option>
              <option value="overdue">Deuda vencida</option>
              <option value="current">Deuda al día</option>
              <option value="paid">Pagado</option>
              <option value="all">Todos</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
              Aplicar filtros
            </button>
            <Link
              href="/finance/distribution/account-statements"
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </Panel>

      <AccountStatementsResults rows={rows} canExport={canExport} />
    </>
  );
}
