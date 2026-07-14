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

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
