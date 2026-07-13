import { PageHeader, Panel } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { saveSupplierAction } from "@/modules/finance/suppliers/application/supplier-actions";
export default async function Page() {
  const ctx = await requirePermission("finance.suppliers.manage");
  return (
    <>
      <PageHeader
        title="Nuevo proveedor"
        description="Registra la ficha comercial y luego agrega su cuenta bancaria."
        eyebrow="Gestión transversal · Proveedores"
      />
      <Panel>
        <form
          action={saveSupplierAction}
          className="grid max-w-3xl gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="company_id" value={ctx.companies[0]?.id} />
          <F n="rut" l="RUT" />
          <F n="legal_name" l="Razón social" />
          <F n="trade_name" l="Nombre de fantasía" />
          <F n="business_activity" l="Giro" />
          <F n="email" l="Correo" t="email" />
          <F n="phone" l="Teléfono" />
          <F n="address" l="Dirección" />
          <button className="rounded-xl bg-[#173f2d] p-3 font-semibold text-white md:col-span-2">
            Crear proveedor
          </button>
        </form>
      </Panel>
    </>
  );
}
function F({ n, l, t = "text" }: { n: string; l: string; t?: string }) {
  return (
    <label>
      {l}
      <input
        name={n}
        type={t}
        className="mt-1 w-full rounded-xl border p-3"
        required={["rut", "legal_name"].includes(n)}
      />
    </label>
  );
}
