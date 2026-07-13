import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { SupplierBankForm } from "@/components/finance/supplier-bank-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    ctx = await requirePermission("finance.supplier_bank_accounts.view"),
    s = await createSupabaseServerClient();
  const { data } = await s
    .from("suppliers")
    .select("id,legal_name,rut,supplier_bank_accounts(*)")
    .eq("id", id)
    .single();
  if (!data) notFound();
  const a = Array.isArray(data.supplier_bank_accounts)
    ? data.supplier_bank_accounts[0]
    : data.supplier_bank_accounts;
  const { data: audit } =
    ctx.permissions.has("audit.logs.view") && a
      ? await s
          .from("audit_logs")
          .select("id,action,created_at")
          .eq("entity_type", "supplier_bank_accounts")
          .eq("entity_id", a.id)
          .order("created_at", { ascending: false })
      : { data: [] };
  return (
    <>
      <PageHeader
        title={data.legal_name}
        description={`RUT ${data.rut} · Cuenta bancaria`}
        eyebrow="Gestión transversal · Proveedores"
      />
      <Link
        href="/suppliers"
        className="mb-4 inline-block font-semibold text-[#277a55]"
      >
        Volver
      </Link>
      <div className="grid gap-5 xl:grid-cols-[1fr_350px]">
        <Panel>
          <SupplierBankForm supplierId={id} account={a ?? undefined} />
        </Panel>
        <Panel>
          <h2 className="mb-3 font-semibold">Historial</h2>
          {audit?.map((x) => (
            <p key={x.id} className="border-t py-2 text-xs">
              {x.action} · {new Date(x.created_at).toLocaleString("es-CL")}
            </p>
          ))}
          {!audit?.length && (
            <p className="text-sm text-slate-500">Sin cambios visibles.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
