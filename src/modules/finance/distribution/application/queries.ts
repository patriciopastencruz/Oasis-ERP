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

export async function dailyDistributionData(date: string) {
  const { ctx, unit, supabase } = await distributionContext();
  const [orders, summary, customers, products, drivers] = await Promise.all([
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
  ]);
  return {
    ctx,
    unit,
    date,
    orders: orders.data ?? [],
    summary: (summary.data ?? {}) as Record<string, number>,
    customers: customers.data ?? [],
    products: products.data ?? [],
    drivers: drivers.data ?? [],
  };
}

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
