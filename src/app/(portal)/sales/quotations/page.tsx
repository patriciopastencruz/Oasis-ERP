/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { StatusBadge } from "@/components/finance/status-badge";
import { PageHeader, Panel } from "@/components/ui/page";
import { clp } from "@/modules/sales/quotations/domain/quotation";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { Notice, QuotationTabs, inputClass } from "@/modules/sales/ui";

export default async function Quotations({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await salesContext("sales.quotations.create");
  const canApprove = ctx.permissions.has("sales.quotations.approve");
  let query = supabase
    .from("om_quotations")
    .select(
      "id,quotation_number,client_company,status,total,updated_at,created_by,profiles!om_quotations_created_by_fkey(first_name,last_name)",
    )
    .eq("business_unit_id", unit.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (q.status) query = query.eq("status", q.status);
  const { data: quotations } = await query;

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Cotizaciones"
        description="Portal de cotizaciones con correlativo, aprobación y entrega al cliente."
      />
      <QuotationTabs canApprove={canApprove} />
      <Notice success={q.success} error={q.error} />
      <Panel className="mb-4">
        <form className="grid gap-2 md:grid-cols-4">
          <select className={inputClass} name="status" defaultValue={q.status}>
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobada</option>
            <option value="rejected">Rechazada</option>
            <option value="delivered">Entregada</option>
          </select>
          <button className="rounded-xl bg-[var(--oasis-primary)] px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </Panel>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[#718078]">
              <th className="p-2">N°</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th className="text-right">Total</th>
              <th>Estado</th>
              <th>Actualizada</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {quotations?.map((x: any) => {
              const seller = Array.isArray(x.profiles)
                ? x.profiles[0]
                : x.profiles;
              return (
                <tr key={x.id} className="border-b align-top">
                  <td className="p-2 font-mono text-xs">
                    {x.quotation_number ?? "Borrador"}
                  </td>
                  <td className="font-semibold">{x.client_company}</td>
                  <td>
                    {seller
                      ? `${seller.first_name ?? ""} ${seller.last_name ?? ""}`.trim()
                      : "—"}
                  </td>
                  <td className="text-right">{clp.format(Number(x.total))}</td>
                  <td>
                    <StatusBadge value={x.status} />
                  </td>
                  <td>
                    {new Date(x.updated_at).toLocaleDateString("es-CL", {
                      timeZone: "America/Santiago",
                    })}
                  </td>
                  <td>
                    <Link
                      className="font-semibold text-[var(--oasis-primary)] underline"
                      href={`/sales/quotations/${x.id}`}
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!quotations?.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#718078]">
                  No hay cotizaciones para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
