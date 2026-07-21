/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { clp } from "@/modules/sales/quotations/domain/quotation";
import { reviewQuotationAction } from "@/modules/sales/quotations/application/actions";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { Notice, QuotationTabs, inputClass } from "@/modules/sales/ui";

export default async function QuotationApprovals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await salesContext("sales.quotations.approve");
  const { data: quotations } = await supabase
    .from("om_quotations")
    .select(
      "id,quotation_number,client_company,client_place,total,created_at,seller:profiles!om_quotations_created_by_fkey(first_name,last_name)",
    )
    .eq("business_unit_id", unit.id)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true });

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Aprobación de cotizaciones"
        description="Cotizaciones enviadas por el equipo de ventas, pendientes de tu decisión."
      />
      <QuotationTabs canApprove />
      <Notice success={q.success} error={q.error} />
      <div className="space-y-3">
        {quotations?.map((x: any) => {
          const seller = Array.isArray(x.seller) ? x.seller[0] : x.seller;
          return (
            <Panel key={x.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-[#718078]">
                    {x.quotation_number}
                  </p>
                  <h2 className="font-semibold">{x.client_company}</h2>
                  <p className="text-sm text-[#718078]">{x.client_place}</p>
                  <p className="mt-1 text-sm">
                    Vendedor/a: {seller?.first_name} {seller?.last_name}
                  </p>
                  <p className="mt-1 text-lg font-bold text-[var(--oasis-primary)]">
                    {clp.format(Number(x.total))}
                  </p>
                  <Link
                    className="mt-2 inline-block text-sm font-semibold text-[var(--oasis-primary)] underline"
                    href={`/sales/quotations/${x.id}`}
                  >
                    Ver detalle completo
                  </Link>
                </div>
                <form
                  action={reviewQuotationAction}
                  className="flex min-w-72 flex-col gap-2"
                >
                  <input type="hidden" name="quotation_id" value={x.id} />
                  <input
                    className={inputClass}
                    name="comment"
                    placeholder="Comentario de resolución"
                    required
                  />
                  <div className="flex gap-2">
                    <button
                      name="decision"
                      value="approved"
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Aprobar
                    </button>
                    <button
                      name="decision"
                      value="rejected"
                      className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Rechazar
                    </button>
                  </div>
                </form>
              </div>
            </Panel>
          );
        })}
        {!quotations?.length && (
          <Panel>
            <p className="text-sm text-[#718078]">
              No hay cotizaciones pendientes de aprobación.
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}
