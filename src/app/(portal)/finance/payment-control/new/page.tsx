import { PageHeader } from "@/components/ui/page";
import { PaymentRequestForm } from "@/components/finance/payment-request-form";
import { SupplierQuickCreate } from "@/components/finance/supplier-quick-create";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import Link from "next/link";
export default async function NewRequest() {
  const ctx = await requirePermission("finance.payment_requests.create");
  const s = await createSupabaseServerClient();
  const companyIds = ctx.companies.map((x) => x.id);
  const [{ data: suppliers }, { data: categories }, { data: centers }] =
    await Promise.all([
      s
        .from("suppliers")
        .select("id,company_id,rut,legal_name")
        .in("company_id", companyIds)
        .eq("active", true)
        .order("legal_name"),
      s
        .from("expense_categories")
        .select("id,company_id,business_unit_id,name")
        .in("company_id", companyIds)
        .eq("active", true)
        .order("name"),
      s
        .from("cost_centers")
        .select("id,company_id,business_unit_id,name")
        .in("company_id", companyIds)
        .eq("active", true)
        .order("name"),
    ]);
  return (
    <>
      <PageHeader
        title="Nueva solicitud"
        description="Guarda el borrador y revísalo antes de enviarlo a aprobación."
        eyebrow="Finanzas · Solicitud de Pagos"
      />
      {ctx.permissions.has("finance.suppliers.manage") && (
        <SupplierQuickCreate
          companies={ctx.companies.map((x) => ({
            id: x.id,
            name: x.trade_name,
          }))}
        />
      )}
      <div className="mb-5 flex flex-wrap gap-3 text-sm font-semibold text-[#277a55]">
        {(ctx.permissions.has("finance.expense_categories.manage") ||
          ctx.permissions.has("administration.categories.manage")) && (
          <Link href="/finance/payment-control/categories">
            Crear categoría
          </Link>
        )}
        {(ctx.permissions.has("finance.cost_centers.manage") ||
          ctx.permissions.has("administration.cost_centers.manage")) && (
          <Link href="/finance/payment-control/cost-centers">
            Crear centro de costo
          </Link>
        )}
      </div>
      <PaymentRequestForm
        companies={ctx.companies.map((x) => ({ id: x.id, name: x.trade_name }))}
        units={ctx.units}
        suppliers={suppliers ?? []}
        categories={categories ?? []}
        centers={centers ?? []}
      />
    </>
  );
}
