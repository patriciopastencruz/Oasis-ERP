import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requirePermission("finance.suppliers.view");
  const p = await searchParams,
    s = await createSupabaseServerClient();
  let q = s
    .from("suppliers")
    .select(
      "id,legal_name,rut,supplier_bank_accounts(id,bank_name,account_number,active)",
    )
    .is("deleted_at", null)
    .order("legal_name");
  if (p.q) q = q.or(`legal_name.ilike.%${p.q}%,rut.ilike.%${p.q}%`);
  const { data } = await q;
  return (
    <>
      <PageHeader
        title="Proveedores y cuentas bancarias"
        description="Administración de la cuenta bancaria única por proveedor."
        eyebrow="Gestión transversal"
      />
      {ctx.permissions.has("finance.suppliers.manage") && (
        <Link
          href="/suppliers/new"
          className="mb-4 inline-block rounded-xl bg-[#173f2d] px-4 py-2 text-white"
        >
          Nuevo proveedor
        </Link>
      )}
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={p.q}
          placeholder="Proveedor o RUT"
          className="rounded-xl border bg-white px-4 py-2"
        />
        <button className="rounded-xl bg-[#173f2d] px-4 text-white">
          Buscar
        </button>
      </form>
      <Panel>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="pb-3">Proveedor</th>
              <th>Banco</th>
              <th>Cuenta</th>
              <th>Estado de cuenta</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.map((x) => {
              const a = one(x.supplier_bank_accounts);
              return (
                <tr key={x.id} className="border-t">
                  <td className="py-4">
                    <b>{x.legal_name}</b>
                    <small className="block">{x.rut}</small>
                  </td>
                  <td>{a?.bank_name ?? "Sin cuenta"}</td>
                  <td>{a ? mask(a.account_number) : "—"}</td>
                  <td>{a ? (a.active ? "Activa" : "Inactiva") : "—"}</td>
                  <td>
                    {ctx.permissions.has(
                      "finance.supplier_bank_accounts.view",
                    ) && (
                      <Link
                        href={`/suppliers/${x.id}`}
                        className="font-semibold text-[#277a55]"
                      >
                        Administrar
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
function mask(x: string) {
  return `${"*".repeat(Math.max(4, x.length - 4))}${x.slice(-4)}`;
}
function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}
