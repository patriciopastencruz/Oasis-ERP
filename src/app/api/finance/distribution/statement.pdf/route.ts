/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { distributionContext } from "@/modules/finance/distribution/application/queries";

const money = (value: number) =>
  `$ ${Math.round(value).toLocaleString("es-CL")}`;
export async function GET(request: NextRequest) {
  const customerId = z
    .string()
    .uuid()
    .parse(request.nextUrl.searchParams.get("customer"));
  const { ctx, unit, supabase } = await distributionContext(
    "finance.distribution.reports.view",
  );
  if (!ctx.permissions.has("finance.distribution.reports.export"))
    return new NextResponse("No autorizado", { status: 403 });
  const [{ data: customer }, { data: orders }] = await Promise.all([
    supabase
      .from("dist_customers")
      .select("code,name,legal_name,address,email,phone,credit_days")
      .eq("id", customerId)
      .eq("business_unit_id", unit.id)
      .single(),
    supabase
      .from("dist_orders")
      .select(
        "id,order_number,delivery_date,total,payment_status,dist_payment_allocations(amount)",
      )
      .eq("customer_id", customerId)
      .eq("business_unit_id", unit.id)
      .in("status", ["delivered", "partially_delivered"])
      .order("delivery_date"),
  ]);
  if (!customer)
    return new NextResponse("Cliente no encontrado", { status: 404 });
  const rows = (orders ?? []).map((o: any) => {
    const paid = (o.dist_payment_allocations ?? []).reduce(
      (s: number, x: { amount: number }) => s + Number(x.amount),
      0,
    );
    return { ...o, paid, balance: Number(o.total) - paid };
  });
  const total = rows.reduce((s, x) => s + Number(x.total), 0),
    paid = rows.reduce((s, x) => s + x.paid, 0),
    balance = total - paid;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.07, 0.25, 0.16),
    muted = rgb(0.38, 0.45, 0.41);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const draw = (
    value: string,
    x: number,
    size = 10,
    font = regular,
    color = rgb(0.08, 0.12, 0.1),
  ) =>
    page.drawText(value.replace(/[^ -ÿ]/g, "-"), { x, y, size, font, color });
  const nextPage = () => {
    page = pdf.addPage([595, 842]);
    y = 790;
    page.drawText("OASIS ERP - Estado de Pago", {
      x: 44,
      y,
      size: 11,
      font: bold,
      color: green,
    });
    y -= 34;
  };
  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: green });
  page.drawText("OASIS ERP", {
    x: 44,
    y: 807,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("DISTRIBUIDORA ALTIPLANICA - ESTADO DE PAGO", {
    x: 44,
    y: 782,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y = 724;
  draw(`Cliente: ${customer.name}`, 44, 15, bold, green);
  y -= 22;
  draw(
    `Codigo: ${customer.code}   Emision: ${new Date().toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`,
    44,
    9,
    regular,
    muted,
  );
  y -= 17;
  draw(
    `Direccion: ${customer.address}   Telefono: ${customer.phone}`,
    44,
    9,
    regular,
    muted,
  );
  y -= 35;
  page.drawRectangle({
    x: 44,
    y: y - 48,
    width: 507,
    height: 64,
    color: rgb(0.95, 0.97, 0.96),
  });
  draw("TOTAL VENDIDO", 60, 8, bold, muted);
  draw("TOTAL ABONADO", 230, 8, bold, muted);
  draw("SALDO PENDIENTE", 400, 8, bold, muted);
  y -= 25;
  draw(money(total), 60, 16, bold, green);
  draw(money(paid), 230, 16, bold, green);
  draw(money(balance), 400, 16, bold, balance > 0 ? rgb(0.7, 0.2, 0.1) : green);
  y -= 55;
  draw("DETALLE DE OPERACIONES", 44, 11, bold, green);
  y -= 24;
  page.drawRectangle({ x: 44, y: y - 8, width: 507, height: 24, color: green });
  page.drawText("Fecha", {
    x: 52,
    y,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Pedido", {
    x: 110,
    y,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Total", {
    x: 300,
    y,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Abonos", {
    x: 380,
    y,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Saldo", {
    x: 465,
    y,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y -= 27;
  for (const row of rows) {
    if (y < 70) nextPage();
    draw(row.delivery_date, 52, 8);
    draw(row.order_number, 110, 8, bold);
    draw(money(Number(row.total)), 300, 8);
    draw(money(row.paid), 380, 8);
    draw(
      money(row.balance),
      465,
      8,
      bold,
      row.balance > 0 ? rgb(0.65, 0.18, 0.12) : green,
    );
    y -= 20;
    page.drawLine({
      start: { x: 44, y: y + 7 },
      end: { x: 551, y: y + 7 },
      thickness: 0.5,
      color: rgb(0.87, 0.9, 0.88),
    });
  }
  if (!rows.length) {
    draw(
      "No existen operaciones a credito para este cliente.",
      52,
      9,
      regular,
      muted,
    );
    y -= 20;
  }
  y = Math.max(y - 30, 45);
  draw(
    "Documento emitido por OASIS ERP. Los pagos posteriores a la emision pueden no estar reflejados.",
    44,
    8,
    regular,
    muted,
  );
  const bytes = await pdf.save();
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="estado-pago-${customer.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
