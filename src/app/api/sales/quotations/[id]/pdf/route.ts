import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { buildQuotationPdf } from "@/modules/sales/quotations/application/quotation-pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success)
    return new NextResponse("Cotización inválida", { status: 400 });
  const { supabase } = await salesContext("sales.quotations.create");
  const [{ data: quotation }, { data: lines }] = await Promise.all([
    supabase
      .from("om_quotations")
      .select(
        "quotation_number,status,client_company,client_rut,client_contact,client_email,client_place,discount,net,iva,total,terms,submitted_at",
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("om_quotation_lines")
      .select("description,quantity,unit_price,line_total")
      .eq("quotation_id", idResult.data)
      .order("position"),
  ]);
  if (!quotation)
    return new NextResponse("Cotización no encontrada", { status: 404 });
  if (!["approved", "delivered"].includes(quotation.status))
    return new NextResponse("La cotización aún no está aprobada", {
      status: 409,
    });
  const bytes = await buildQuotationPdf({
    quotationNumber: quotation.quotation_number ?? "",
    issuedAt: quotation.submitted_at
      ? new Date(quotation.submitted_at)
      : new Date(),
    client: {
      company: quotation.client_company,
      rut: quotation.client_rut,
      contact: quotation.client_contact,
      email: quotation.client_email,
      place: quotation.client_place,
    },
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      lineTotal: Number(l.line_total),
    })),
    discount: Number(quotation.discount),
    net: Number(quotation.net),
    iva: Number(quotation.iva),
    total: Number(quotation.total),
    terms: quotation.terms,
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${quotation.quotation_number ?? "cotizacion"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
