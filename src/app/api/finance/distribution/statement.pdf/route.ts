/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { distributionContext } from "@/modules/finance/distribution/application/queries";
import { buildCollectionStatementPdf } from "@/modules/finance/distribution/application/statement-pdf";

export async function GET(request: NextRequest) {
  const customerIdResult = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("customer"));
  const selectedResult = z
    .array(z.string().uuid())
    .max(100)
    .safeParse(request.nextUrl.searchParams.getAll("order"));
  if (!customerIdResult.success || !selectedResult.success)
    return new NextResponse("Parámetros de cobranza inválidos", {
      status: 400,
    });
  const customerId = customerIdResult.data;
  const selectedOrderIds = [...new Set(selectedResult.data)];
  const { ctx, unit, supabase } = await distributionContext(
    "finance.distribution.reports.view",
  );
  if (!ctx.permissions.has("finance.distribution.reports.export"))
    return new NextResponse("No autorizado", { status: 403 });
  const customerQuery = supabase
    .from("dist_customers")
    .select("code,name,legal_name,address,email,phone,credit_days")
    .eq("id", customerId)
    .eq("business_unit_id", unit.id)
    .single();
  let ordersQuery = supabase
    .from("dist_orders")
    .select(
      "id,order_number,created_at,delivery_date,total,payment_status,dist_order_lines(planned_quantity,delivered_quantity,dist_products(name,presentation))",
    )
    .eq("customer_id", customerId)
    .eq("business_unit_id", unit.id)
    .eq("payment_condition", "credit")
    .in("status", ["delivered", "partially_delivered"])
    .is("deleted_at", null)
    .order("created_at");
  if (selectedOrderIds.length > 0)
    ordersQuery = ordersQuery.in("id", selectedOrderIds);
  const [{ data: customer, error: customerError }, ordersResult] =
    await Promise.all([customerQuery, ordersQuery]);
  if (!customer)
    return new NextResponse("Cliente no encontrado", { status: 404 });
  if (customerError || ordersResult.error)
    return new NextResponse("No se pudo generar el estado de pago", {
      status: 500,
    });
  if (
    selectedOrderIds.length > 0 &&
    (ordersResult.data ?? []).length !== selectedOrderIds.length
  )
    return new NextResponse(
      "Uno o más pedidos no pertenecen al cliente o no están disponibles para cobro",
      { status: 400 },
    );

  const orderIds = (ordersResult.data ?? []).map((order) => order.id);
  const allocationsResult = orderIds.length
    ? await supabase
        .from("dist_payment_allocations")
        .select("order_id,amount,dist_payments!inner(status,business_unit_id)")
        .in("order_id", orderIds)
        .eq("dist_payments.status", "confirmed")
        .eq("dist_payments.business_unit_id", unit.id)
    : { data: [], error: null };
  if (allocationsResult.error)
    return new NextResponse("No se pudieron validar los abonos", {
      status: 500,
    });
  const paidByOrder = new Map<string, number>();
  for (const allocation of allocationsResult.data ?? []) {
    paidByOrder.set(
      allocation.order_id,
      (paidByOrder.get(allocation.order_id) ?? 0) + Number(allocation.amount),
    );
  }
  const rows = (ordersResult.data ?? []).map((order: any) => {
    const paid = Math.min(Number(order.total), paidByOrder.get(order.id) ?? 0);
    const products = (order.dist_order_lines ?? [])
      .map((line: any) => {
        const quantity = line.delivered_quantity ?? line.planned_quantity;
        const presentation = line.dist_products?.presentation
          ? ` ${line.dist_products.presentation}`
          : "";
        return `${line.dist_products?.name ?? "Producto"}: ${quantity}${presentation}`;
      })
      .join("; ");
    return {
      ...order,
      total: Number(order.total),
      products,
      paid,
      balance: Math.max(0, Number(order.total) - paid),
    };
  });
  if (selectedOrderIds.length > 0 && rows.some((row) => row.balance <= 0))
    return new NextResponse(
      "Uno de los pedidos seleccionados ya no tiene saldo pendiente",
      { status: 409 },
    );
  const bytes = await buildCollectionStatementPdf({
    customer,
    orders: rows,
    selectedOnly: selectedOrderIds.length > 0,
  });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="estado-pago-${customer.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
