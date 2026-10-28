import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext, formatDate, clp } from "@/modules/lodging/application/queries";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await lodgingContext("lodging.quotations.manage");
  const { data: quotations } = await supabase
    .from("lodging_quotations")
    .select("id,quotation_number,issued_on,client_company,net,total,status")
    .eq("business_unit_id", unit.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Cotizaciones a empresas"
          description="Cotizaciones de hospedaje para empresas, con PDF listo para enviar."
        />
        <Link
          href="/lodging/quotations/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Nueva cotización
        </Link>
      </div>
      {q.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{q.success}</p>}
      {q.error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{q.error}</p>}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-2">N°</th>
              <th className="px-2">Fecha</th>
              <th className="px-2">Empresa</th>
              <th className="px-2 text-right">Neto</th>
              <th className="px-2 text-right">Total (con IVA)</th>
              <th className="px-2">Estado</th>
              <th className="pl-2" />
            </tr>
          </thead>
          <tbody>
            {(quotations ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium">
                  <Link href={`/lodging/quotations/${r.id}`} className="text-[#0b4f9c] hover:underline">
                    {r.quotation_number}
                  </Link>
                </td>
                <td className="px-2">{formatDate(r.issued_on)}</td>
                <td className="px-2">{r.client_company}</td>
                <td className="px-2 text-right">{clp.format(Number(r.net))}</td>
                <td className="px-2 text-right font-semibold">{clp.format(Number(r.total))}</td>
                <td className="px-2">
                  {r.status === "voided" ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Anulada</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Emitida</span>
                  )}
                </td>
                <td className="pl-2 text-right">
                  <a href={`/api/lodging/quotations/${r.id}/pdf`} target="_blank" className="font-semibold text-[#0b4f9c]">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!quotations?.length && (
          <p className="py-6 text-center text-sm text-slate-500">Aún no hay cotizaciones en este hostal.</p>
        )}
      </Panel>
    </>
  );
}
