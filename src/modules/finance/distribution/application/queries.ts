import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

export async function distributionContext(
  permission = "finance.distribution.view",
) {
  const ctx = await requirePermission(permission);
  const selected = (await cookies()).get("oasis_unit")?.value;
  const unit =
    ctx.units.find((u) => u.id === selected && u.code === "DA") ??
    ctx.units.find((u) => u.code === "DA");
  if (!unit) redirect("/no-access");
  const company = ctx.companies.find((c) => c.id === unit.company_id);
  if (!company) redirect("/no-access");
  return { ctx, unit, company, supabase: await createSupabaseServerClient() };
}

export type DistributionProductSummary = {
  id: string;
  code: string;
  name: string;
  presentation: string;
  planned_quantity: number;
  delivered_quantity: number;
  delivered_sales: number;
};

export type DistributionDailySummary = {
  orders_total: number;
  delivered: number;
  partial: number;
  pending: number;
  not_delivered: number;
  unassigned: number;
  route_sales: number;
  delivery_rate: number;
  planned_sales: number;
  delivered_sales: number;
  cash: number;
  transfer: number;
  credit: number;
  collected: number;
  cash_received: number;
  transfer_received: number;
  mixed_received: number;
  total_received: number;
  expense_total: number;
  ice_kg: number;
  water_units: number;
  product_details: DistributionProductSummary[];
};

export async function dailyDistributionData(
  date: string,
  permission = "finance.distribution.view",
) {
  const { ctx, unit, supabase } = await distributionContext(permission);
  const [orders, summary, customers, products, drivers, closure] =
    await Promise.all([
      supabase
        .from("dist_orders")
        .select(
          "*,dist_customers(code,name),dist_order_lines(id,planned_quantity,delivered_quantity,unit_price,line_total,dist_products(code,name,ice_weight_kg))",
        )
        .eq("business_unit_id", unit.id)
        .eq("delivery_date", date)
        .is("deleted_at", null)
        .order("route_position", { nullsFirst: false }),
      supabase.rpc("dist_daily_summary", {
        target_unit: unit.id,
        target_date: date,
      }),
      supabase
        .from("dist_customers")
        .select(
          "id,code,name,address,phone,has_credit,credit_limit,credit_days,credit_status",
        )
        .eq("business_unit_id", unit.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("dist_products")
        .select("id,code,name,presentation,ice_weight_kg")
        .eq("business_unit_id", unit.id)
        .eq("active", true)
        .is("deleted_at", null)
        .order("display_order"),
      ctx.permissions.has("finance.distribution.routes.manage")
        ? supabase.rpc("dist_drivers", { target_unit: unit.id })
        : Promise.resolve({ data: [], error: null }),
      permission === "finance.distribution.reports.view"
        ? supabase
            .from("dist_daily_closures")
            .select("status,observations,closed_at")
            .eq("business_unit_id", unit.id)
            .eq("closure_date", date)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  const error =
    orders.error ??
    summary.error ??
    customers.error ??
    products.error ??
    drivers.error ??
    closure.error;
  if (error)
    throw new Error(`No se pudo consultar la jornada: ${error.message}`);
  return {
    ctx,
    unit,
    date,
    orders: orders.data ?? [],
    summary: (summary.data ?? {}) as DistributionDailySummary,
    customers: customers.data ?? [],
    products: products.data ?? [],
    drivers: drivers.data ?? [],
    closure: closure.data,
  };
}

export async function distributionOrderDetail(orderId: string) {
  const { ctx, unit, supabase } = await distributionContext();
  const [order, products, requests] = await Promise.all([
    supabase
      .from("dist_orders")
      .select(
        "*,dist_customers(id,code,name,address,phone,has_credit,credit_limit,credit_days),dist_order_lines(id,product_id,planned_quantity,delivered_quantity,unit_price,line_total,dist_products(code,name,presentation))",
      )
      .eq("id", orderId)
      .eq("business_unit_id", unit.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("dist_products")
      .select("id,code,name,presentation")
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("dist_change_requests")
      .select("id,type,status,reason,resolution_comment,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
  ]);
  const error = order.error ?? products.error ?? requests.error;
  if (error)
    throw new Error(`No se pudo consultar el pedido: ${error.message}`);
  return {
    ctx,
    unit,
    order: order.data,
    products: products.data ?? [],
    requests: requests.data ?? [],
  };
}

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export type CustomerBalance = {
  sold: number;
  paid: number;
  balance: number;
  overdue: number;
  nextDue?: string;
  oldestDue?: string;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type CreditOrder = {
  id: string;
  customer_id: string | null;
  delivery_date: string;
  total: number | string;
};

/**
 * Saldo pendiente y vencido por cliente, a partir de pedidos a crédito
 * entregados y lo ya abonado por pedido.
 * Única fuente de verdad: se reutiliza en Clientes y Estado de pago para
 * que ambas pantallas nunca muestren una deuda distinta para el mismo cliente.
 */
export function aggregateCustomerBalances(
  orders: CreditOrder[],
  paidByOrder: Map<string, number>,
  creditDaysById: Map<string, number>,
) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const balances = new Map<string, CustomerBalance>();
  for (const order of orders) {
    if (!order.customer_id) continue;
    const paid = Math.min(Number(order.total), paidByOrder.get(order.id) ?? 0);
    const balance = Math.max(0, Number(order.total) - paid);
    const due = addDays(
      order.delivery_date,
      creditDaysById.get(order.customer_id) ?? 0,
    );
    const current = balances.get(order.customer_id) ?? {
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
    balances.set(order.customer_id, current);
  }
  return balances;
}

export function paidAmountsByOrder(
  allocations: { order_id: string; amount: number | string }[],
) {
  const paidByOrder = new Map<string, number>();
  for (const allocation of allocations) {
    paidByOrder.set(
      allocation.order_id,
      (paidByOrder.get(allocation.order_id) ?? 0) + Number(allocation.amount),
    );
  }
  return paidByOrder;
}
