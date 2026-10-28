import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { lodgingContext, formatDate, clp } from "@/modules/lodging/application/queries";
import { voidLodgingQuotationAction } from "@/modules/lodging/application/quotation-actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { unit, supabase } = await lodgingContext("lodging.quotations.manage");
  const [{ data: quotation }, { data: lines }, { data: photos }] = await Promise.all([
    supabase.from("lodging_quotations").select("*").eq("id", id).eq("business_unit_id", unit.id).maybeSingle(),
    supabase.from("lodging_quotation_lines").select("*").eq("quotation_id", id).order("position"),
    supabase.from("lodging_quotation_photos").select("object_path").eq("quotation_id", id).order("created_at"),
  ]);
  if (!quotation) notFound();
  const thumbs = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage.from("lodging-operations").createSignedUrl(p.object_path, 3600);
      return data?.signedUrl ?? null;
    }),
  );
  const voided = quotation.status === "voided";
  return (
    <>
      <div className="mb-4">
        <Link href="/lodging/quotations" className="text-sm font-semibold text-[#0b4f9c]">
          ← Volver a cotizaciones
        </Link>
      </div>
      <PageHeader
        eyebrow={`${unit.name} · Cotización de hospedaje`}
        title={quotation.quotation_number}
        description={quotation.client_company}
      />
      {q.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{q.success}</p>}
      {q.error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{q.error}</p>}
      {voided && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Anulada: {quotation.void_reason}
        </p>
      )}
      <Panel className="mb-4 overflow-x-auto">
        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Fecha</dt><dd>{formatDate(quotation.issued_on)}</dd></div>
          <div><dt className="text-xs text-slate-500">RUT</dt><dd>{quotation.client_rut || "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Contacto</dt><dd>{quotation.client_contact || "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Correo</dt><dd>{quotation.client_email || "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Dirección del hostal</dt><dd>{quotation.hostel_address || "—"}</dd></div>
          <div>
            <dt className="text-xs text-slate-500">Estadía</dt>
            <dd>
              {quotation.check_in && quotation.check_out
                ? `${formatDate(quotation.check_in)} al ${formatDate(quotation.check_out)}`
                : "Sin fechas"}
            </dd>
          </div>
        </dl>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-2">Descripción</th>
              <th className="px-2 text-right">Cant.</th>
              <th className="px-2 text-right">Valor neto</th>
              <th className="px-2 text-right">Noches</th>
              <th className="px-2 text-right">Subtotal</th>
              <th className="px-2 text-right">IVA</th>
              <th className="pl-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 pr-2">{l.description}</td>
                <td className="px-2 text-right">{l.quantity}</td>
                <td className="px-2 text-right">{clp.format(Number(l.unit_net))}</td>
                <td className="px-2 text-right">{l.nights}</td>
                <td className="px-2 text-right">{clp.format(Number(l.subtotal))}</td>
                <td className="px-2 text-right">{clp.format(Number(l.iva))}</td>
                <td className="pl-2 text-right font-semibold">{clp.format(Number(l.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal neto</dt><dd>{clp.format(Number(quotation.net))}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">IVA (19%)</dt><dd>{clp.format(Number(quotation.iva))}</dd></div>
          <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Total (IVA incluido)</dt><dd>{clp.format(Number(quotation.total))}</dd></div>
        </dl>
        {thumbs.some(Boolean) && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {thumbs.filter((u): u is string => Boolean(u)).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="Foto de la habitación" className="aspect-[3/4] w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </Panel>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/lodging/quotations/${quotation.id}/pdf`}
          target="_blank"
          className="rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Descargar PDF
        </a>
        {!voided && (
          <form action={voidLodgingQuotationAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="quotation_id" value={quotation.id} />
            <input
              name="reason"
              required
              minLength={5}
              maxLength={500}
              placeholder="Motivo de la anulación"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <ConfirmButton
              message="¿Anular esta cotización? Quedará registrada como anulada."
              className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700"
            >
              Anular
            </ConfirmButton>
          </form>
        )}
      </div>
    </>
  );
}
