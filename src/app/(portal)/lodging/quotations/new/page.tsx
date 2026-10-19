import { PageHeader, Panel } from "@/components/ui/page";
import { LodgingQuotationForm } from "@/components/lodging/quotation-form";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { createLodgingQuotationAction } from "@/modules/lodging/application/quotation-actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await lodgingContext("lodging.quotations.manage");
  const [{ data: last }, { data: rooms }] = await Promise.all([
    // La dirección se recuerda: se propone la última usada en este hostal.
    supabase
      .from("lodging_quotations")
      .select("hostel_address")
      .eq("business_unit_id", unit.id)
      .not("hostel_address", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lodging_rooms")
      .select("room_type")
      .eq("business_unit_id", unit.id)
      .eq("active", true),
  ]);
  const roomTypes = [...new Set((rooms ?? []).map((r) => r.room_type).filter(Boolean))].sort();
  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Nueva cotización a empresa"
        description="Completa los datos y emite el PDF. El IVA y los totales los calcula el sistema."
      />
      {q.error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{q.error}</p>}
      <Panel>
        <LodgingQuotationForm
          action={createLodgingQuotationAction}
          defaultAddress={last?.hostel_address ?? ""}
          roomTypes={roomTypes}
        />
      </Panel>
    </>
  );
}
