import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { LodgingQuotationForm } from "@/components/lodging/quotation-form";
import { lodgingContext } from "@/modules/lodging/application/queries";
import {
  removeLodgingQuotationPhotoAction,
  updateLodgingQuotationAction,
} from "@/modules/lodging/application/quotation-actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { unit, supabase } = await lodgingContext("lodging.quotations.manage");
  const [{ data: quotation }, { data: lines }, { data: photos }, { data: rooms }] = await Promise.all([
    supabase.from("lodging_quotations").select("*").eq("id", id).eq("business_unit_id", unit.id).maybeSingle(),
    supabase.from("lodging_quotation_lines").select("*").eq("quotation_id", id).order("position"),
    supabase.from("lodging_quotation_photos").select("id,object_path").eq("quotation_id", id).order("created_at"),
    supabase.from("lodging_rooms").select("room_type").eq("business_unit_id", unit.id).eq("active", true),
  ]);
  if (!quotation) notFound();
  if (quotation.status !== "issued")
    redirect(`/lodging/quotations/${id}?error=${encodeURIComponent("Una cotización anulada no se puede editar.")}`);
  const thumbs = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage.from("lodging-operations").createSignedUrl(p.object_path, 3600);
      return { id: p.id, src: data?.signedUrl ?? null };
    }),
  );
  const roomTypes = [...new Set((rooms ?? []).map((r) => r.room_type).filter(Boolean))].sort();
  return (
    <>
      <div className="mb-4">
        <Link href={`/lodging/quotations/${id}`} className="text-sm font-semibold text-[#0b4f9c]">
          ← Volver a la cotización
        </Link>
      </div>
      <PageHeader
        eyebrow={`${unit.name} · Editar cotización`}
        title={quotation.quotation_number}
        description="Se mantienen el folio y la fecha de emisión. El IVA y los totales los recalcula el sistema."
      />
      {q.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{q.success}</p>}
      {q.error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{q.error}</p>}
      {thumbs.length > 0 && (
        <Panel className="mb-4">
          <h2 className="mb-2 font-semibold">Fotos actuales ({thumbs.length})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {thumbs.map((t) => (
              <form key={t.id} action={removeLodgingQuotationPhotoAction} className="grid gap-1.5">
                <input type="hidden" name="quotation_id" value={quotation.id} />
                <input type="hidden" name="photo_id" value={t.id} />
                {t.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.src} alt="Foto de la habitación" className="aspect-[3/4] w-full rounded-lg object-cover" />
                ) : (
                  <div className="aspect-[3/4] w-full rounded-lg bg-slate-100" />
                )}
                <ConfirmButton
                  message="¿Quitar esta foto de la cotización?"
                  className="rounded-lg border border-red-300 px-2 py-1.5 text-xs font-semibold text-red-700"
                >
                  Quitar
                </ConfirmButton>
              </form>
            ))}
          </div>
        </Panel>
      )}
      <Panel>
        <LodgingQuotationForm
          action={updateLodgingQuotationAction}
          defaultAddress=""
          roomTypes={roomTypes}
          initial={{
            id: quotation.id,
            client_company: quotation.client_company,
            client_rut: quotation.client_rut ?? "",
            client_contact: quotation.client_contact ?? "",
            client_email: quotation.client_email ?? "",
            hostel_address: quotation.hostel_address ?? "",
            service_detail: quotation.service_detail ?? "",
            check_in: quotation.check_in ?? "",
            check_out: quotation.check_out ?? "",
            lines: (lines ?? []).map((l) => ({
              description: l.description,
              quantity: Number(l.quantity),
              unit_net: Number(l.unit_net),
              nights: Number(l.nights),
            })),
            existingPhotos: thumbs.length,
          }}
        />
      </Panel>
    </>
  );
}
