/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { inputClass } from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import {
  clp,
  distributionContext,
} from "@/modules/finance/distribution/application/queries";

const todayInChile = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

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
      .select("id,customer_id,delivery_date,total,payment_status")
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

  const paidByOrder = new Map<string, number>();
  for (const allocation of allocationsResult.data ?? []) {
    paidByOrder.set(
      allocation.order_id,
      (paidByOrder.get(allocation.order_id) ?? 0) + Number(allocation.amount),
    );
  }
  const lastPaymentByCustomer = new Map<string, string>();
  for (const payment of paymentsResult.data ?? []) {
    if (payment.customer_id && !lastPaymentByCustomer.has(payment.customer_id))
      lastPaymentByCustomer.set(payment.customer_id, payment.paid_at);
  }

  const today = todayInChile();
  const aggregates = new Map<
    string,
    {
      sold: number;
      paid: number;
      balance: number;
      overdue: number;
      nextDue?: string;
      oldestDue?: string;
    }
  >();
  for (const order of ordersResult.data ?? []) {
    if (!order.customer_id) continue;
    const customer = (customersResult.data ?? []).find(
      (item) => item.id === order.customer_id,
    );
    const paid = Math.min(Number(order.total), paidByOrder.get(order.id) ?? 0);
    const balance = Math.max(0, Number(order.total) - paid);
    const due = addDays(
      order.delivery_date,
      Number(customer?.credit_days ?? 0),
    );
    const current = aggregates.get(order.customer_id) ?? {
      sold: 0,
      paid: 0,
      balance: 0,
      overdue: 0,
    };
    current.sold += Number(order.total);
    current.paid += paid;
    current.balance += balance;
    if (balance > 0 && due < today) {
      current.overdue += balance;
      if (!current.oldestDue || due < current.oldestDue)
        current.oldestDue = due;
    }
    if (
      balance > 0 &&
      due >= today &&
      (!current.nextDue || due < current.nextDue)
    )
      current.nextDue = due;
    aggregates.set(order.customer_id, current);
  }

  const search = q.search?.trim().toLocaleLowerCase("es-CL") ?? "";
  const classification = q.classification ?? "all";
  const state = q.state ?? "debt";
  const rows = (customersResult.data ?? [])
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
      const matchesSearch =
        !search ||
        customer.name.toLocaleLowerCase("es-CL").includes(search) ||
        customer.code.toLocaleLowerCase("es-CL").includes(search);
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
      return matchesSearch && matchesClass && matchesState;
    });

  const totals = rows.reduce(
    (sum, row) => ({
      sold: sum.sold + row.sold,
      paid: sum.paid + row.paid,
      balance: sum.balance + row.balance,
      overdue: sum.overdue + row.overdue,
    }),
    { sold: 0, paid: 0, balance: 0, overdue: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Estado de pago"
        description="Cartera por cliente, saldos vigentes, deuda vencida y estados de pago exportables."
      />
      <Panel className="mb-5">
        <form className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Buscar cliente
            <input
              className={inputClass}
              name="search"
              defaultValue={q.search}
              placeholder="Código o nombre"
            />
          </label>
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
            <button className="rounded-xl bg-[#176b46] px-4 py-2.5 text-sm font-semibold text-white">
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

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Venta a crédito", totals.sold],
          ["Total abonado", totals.paid],
          ["Saldo pendiente", totals.balance],
          ["Deuda vencida", totals.overdue],
        ].map(([label, value]) => (
          <Panel key={label as string}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#718078]">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold">
              {clp.format(value as number)}
            </p>
          </Panel>
        ))}
      </div>

      <Panel className="overflow-x-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Cartera de clientes</h2>
            <p className="text-sm text-[#718078]">
              {rows.length} cliente(s) según los filtros seleccionados.
            </p>
          </div>
        </div>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[#718078]">
              <th className="p-2">Cliente</th>
              <th>Clasificación</th>
              <th className="text-right">Venta crédito</th>
              <th className="text-right">Abonado</th>
              <th className="text-right">Saldo</th>
              <th className="text-right">Vencido</th>
              <th>Vencimiento</th>
              <th>Último pago</th>
              <th>Estado</th>
              <th>Documento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer: any) => (
              <tr key={customer.id} className="border-b align-top">
                <td className="p-2">
                  <b>{customer.name}</b>
                  <div className="font-mono text-xs text-[#718078]">
                    {customer.code}
                  </div>
                </td>
                <td>{customer.dist_customer_classifications?.name ?? "—"}</td>
                <td className="text-right">{clp.format(customer.sold)}</td>
                <td className="text-right">{clp.format(customer.paid)}</td>
                <td className="text-right font-semibold">
                  {clp.format(customer.balance)}
                </td>
                <td className="text-right font-semibold text-red-700">
                  {clp.format(customer.overdue)}
                </td>
                <td>{dateLabel(customer.oldestDue ?? customer.nextDue)}</td>
                <td>{dateLabel(customer.lastPayment)}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${customer.overdue > 0 ? "bg-red-100 text-red-800" : customer.balance > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {customer.overdue > 0
                      ? "Vencido"
                      : customer.balance > 0
                        ? "Al día"
                        : "Pagado"}
                  </span>
                </td>
                <td>
                  {ctx.permissions.has(
                    "finance.distribution.reports.export",
                  ) ? (
                    <Link
                      className="font-semibold text-[#176b46] underline"
                      href={`/api/finance/distribution/statement.pdf?customer=${customer.id}`}
                    >
                      PDF
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[#718078]">
                  No hay clientes que coincidan con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
