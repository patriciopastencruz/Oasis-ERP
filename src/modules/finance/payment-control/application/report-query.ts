import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uiLabel } from "@/lib/ui-labels";
import { requirePermission } from "@/modules/platform/auth/application/session";
export async function paymentReport(filters: URLSearchParams) {
  await requirePermission("finance.reports.view");
  const s = await createSupabaseServerClient();
  let q = s
    .from("payment_requests")
    .select(
      "id,request_number,created_at,supplier_legal_name,supplier_rut,bank_name,account_type,account_number,amount,priority,status,approved_at,notes,company_id,business_unit_id,requester_id,expense_category_id,cost_center_id,profiles!payment_requests_requester_id_fkey(first_name,last_name),business_units(name,companies(trade_name)),expense_categories(name),cost_centers(name),payments(scheduled_date,paid_at,method,operation_number,execution_notes),payment_request_approval_decisions(approver_id,profiles!payment_request_approval_decisions_approver_id_fkey(first_name,last_name))",
    )
    .is("deleted_at", null);
  for (const [k, col] of [
    ["unit", "business_unit_id"],
    ["requester", "requester_id"],
    ["supplier", "supplier_id"],
    ["status", "status"],
    ["priority", "priority"],
    ["category", "expense_category_id"],
    ["cost_center", "cost_center_id"],
  ] as const) {
    const v = filters.get(k);
    if (v) q = q.eq(col, v);
  }
  const from = filters.get("from"),
    to = filters.get("to");
  if (from) q = q.gte("created_at", `${from}T00:00:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[financial-report]", error.code, error.message);
    return [];
  }
  const mapped = (data ?? []).map((r) => {
    const requester = one(r.profiles),
      unit = one(r.business_units),
      cat = one(r.expense_categories),
      center = one(r.cost_centers),
      payment = one(r.payments),
      decision = r.payment_request_approval_decisions?.find(
        (x) => x.approver_id,
      ),
      approver = decision ? one(decision.profiles) : undefined;
    return {
      correlativo: r.request_number,
      fecha: r.created_at,
      solicitante:
        `${requester?.first_name ?? ""} ${requester?.last_name ?? ""}`.trim(),
      unidad: unit?.name,
      proveedor: r.supplier_legal_name,
      rut: r.supplier_rut,
      banco: r.bank_name,
      tipo_cuenta: r.account_type,
      cuenta: r.account_number ? mask(r.account_number) : "",
      categoria: cat?.name,
      centro_costo: center?.name,
      monto: Number(r.amount),
      prioridad: r.priority,
      estado: r.status,
      aprobador: approver ? `${approver.first_name} ${approver.last_name}` : "",
      fecha_aprobacion: r.approved_at,
      fecha_programada: payment?.scheduled_date,
      fecha_pago: payment?.paid_at,
      medio: payment?.method,
      operacion: payment?.operation_number,
      observaciones: payment?.execution_notes ?? r.notes,
    };
  });
  const supplierText = filters.get("supplier_text")?.toLowerCase(),
    requesterText = filters.get("requester_text")?.toLowerCase(),
    approverText = filters.get("approver_text")?.toLowerCase(),
    method = filters.get("method");
  return mapped
    .filter(
      (x) =>
        (!supplierText || x.proveedor.toLowerCase().includes(supplierText)) &&
        (!requesterText ||
          x.solicitante.toLowerCase().includes(requesterText)) &&
        (!approverText || x.aprobador.toLowerCase().includes(approverText)) &&
        (!method || x.medio === method),
    )
    .map((row) => ({
      ...row,
      tipo_cuenta: uiLabel(row.tipo_cuenta),
      prioridad: uiLabel(row.prioridad),
      estado: uiLabel(row.estado),
      medio: row.medio ? uiLabel(row.medio) : row.medio,
    }));
}
function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}
function mask(x: string) {
  return `${"*".repeat(Math.max(4, x.length - 4))}${x.slice(-4)}`;
}
