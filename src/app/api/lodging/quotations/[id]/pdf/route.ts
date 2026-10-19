import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { buildLodgingQuotationPdf } from "@/modules/lodging/application/quotation-pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success) return new NextResponse("Cotización inválida", { status: 400 });
  const { supabase } = await lodgingContext("lodging.quotations.manage");
  const [{ data: quotation }, { data: lines }, { data: photos }] = await Promise.all([
    supabase
      .from("lodging_quotations")
      .select("quotation_number,issued_on,status,client_company,client_rut,client_contact,hostel_address,service_detail,check_in,check_out,total")
      .eq("id", idResult.data)
      .maybeSingle(),
    supabase
      .from("lodging_quotation_lines")
      .select("description,quantity,unit_net,nights,subtotal,iva,total")
      .eq("quotation_id", idResult.data)
      .order("position"),
    supabase
      .from("lodging_quotation_photos")
      .select("object_path,mime_type")
      .eq("quotation_id", idResult.data)
      .order("created_at"),
  ]);
  if (!quotation) return new NextResponse("Cotización no encontrada", { status: 404 });

  const files = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage.from("lodging-operations").download(p.object_path);
      return data ? { bytes: new Uint8Array(await data.arrayBuffer()), mime: p.mime_type } : null;
    }),
  );
  const bytes = await buildLodgingQuotationPdf({
    quotationNumber: quotation.quotation_number,
    issuedOn: quotation.issued_on,
    voided: quotation.status === "voided",
    client: {
      company: quotation.client_company,
      rut: quotation.client_rut,
      contact: quotation.client_contact,
    },
    hostelAddress: quotation.hostel_address,
    serviceDetail: quotation.service_detail,
    checkIn: quotation.check_in,
    checkOut: quotation.check_out,
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitNet: Number(l.unit_net),
      nights: Number(l.nights),
      subtotal: Number(l.subtotal),
      iva: Number(l.iva),
      total: Number(l.total),
    })),
    total: Number(quotation.total),
    photos: files.filter((f): f is NonNullable<typeof f> => f !== null),
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotation.quotation_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
