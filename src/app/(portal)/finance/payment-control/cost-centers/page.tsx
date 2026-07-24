import { PageHeader } from "@/components/ui/page";
import { CatalogAdmin } from "@/components/finance/catalog-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import {
  saveCostCenterAction,
  toggleCostCenterAction,
} from "@/modules/finance/catalogs/application/actions";
import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSession();
  if (
    !ctx.permissions.has("finance.cost_centers.manage") &&
    !ctx.permissions.has("administration.cost_centers.manage")
  )
    redirect("/no-access");
  const p = await searchParams,
    s = await createSupabaseServerClient();
  let q = s
    .from("cost_centers")
    .select(
      "id,company_id,business_unit_id,code,name,description,active,companies(trade_name),business_units(name)",
    )
    .order("name");
  if (p.unit) q = q.eq("business_unit_id", p.unit);
  if (p.status) q = q.eq("active", p.status === "active");
  const { data } = await q;
  return (
    <>
      <PageHeader
        title="Centros de costo"
        description="Centros globales o específicos por unidad."
        eyebrow="Finanzas · Administración"
      />
      {p.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {p.error}
        </p>
      )}
      {p.success && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {p.success}
        </p>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        <select
          name="unit"
          defaultValue={p.unit}
          className="rounded-xl border bg-white p-2.5 text-sm"
        >
          <option value="">Todas las unidades</option>
          {ctx.units.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={p.status}
          className="rounded-xl border bg-white p-2.5 text-sm"
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <button className="rounded-xl bg-[#083f7d] px-4 text-sm text-white">
          Filtrar
        </button>
      </form>
      <CatalogAdmin
        rows={data ?? []}
        companies={ctx.companies.map((x) => ({ id: x.id, name: x.trade_name }))}
        units={ctx.units}
        saveAction={saveCostCenterAction}
        toggleAction={toggleCostCenterAction}
        editId={p.edit}
      />
    </>
  );
}
