import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";

export type PettyCashExportRow = {
  correlativo: string; trabajador: string; unidad: string; semana: string; fecha_gasto: string;
  comercio: string; tipo_documento: string; numero_documento: string; categoria: string;
  centro_costo: string; descripcion: string; monto: number; estado: string; administrador: string;
  fecha_aprobacion: string; observaciones: string; comprobante: string;
};

export async function pettyCashReport(params: URLSearchParams) {
  const ctx = await requireSession();
  if (!ctx.permissions.has("finance.petty_cash.reports.view") && !ctx.permissions.has("finance.petty_cash.reports.export"))
    throw new Error("No tienes permiso para consultar este reporte.");
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("petty_cash_expense_lines").select(
    "expense_date,merchant_name,document_type,document_number,description,amount,observation,expense_categories(name),cost_centers(name),petty_cash_line_attachments(original_name,deleted_at),petty_cash_reports!inner(report_number,week_start,week_end,status,approved_at,business_unit_id,responsible_id,business_units(name),responsible:profiles!petty_cash_reports_responsible_id_fkey(first_name,last_name),approver:profiles!petty_cash_reports_approved_by_fkey(first_name,last_name))",
  ).is("deleted_at", null);
  if (params.get("unit")) query = query.eq("business_unit_id", params.get("unit")!);
  if (params.get("worker")) query = query.eq("petty_cash_reports.responsible_id", params.get("worker")!);
  if (params.get("week")) query = query.eq("petty_cash_reports.week_start", params.get("week")!);
  if (params.get("status")) query = query.eq("petty_cash_reports.status", params.get("status")!);
  if (params.get("category")) query = query.eq("expense_category_id", params.get("category")!);
  if (params.get("center")) query = query.eq("cost_center_id", params.get("center")!);
  if (params.get("merchant")) query = query.ilike("merchant_name", `%${params.get("merchant")}%`);
  if (params.get("document_type")) query = query.eq("document_type", params.get("document_type")!);
  const { data, error } = await query.order("expense_date", { ascending: false }).limit(10000);
  if (error) throw new Error("No fue posible generar el reporte de Caja Chica.");
  return (data ?? []).map((line): PettyCashExportRow => {
    const report = one<Record<string, unknown>>(line.petty_cash_reports) ?? {};
    const worker = one<{ first_name?: string; last_name?: string }>(report.responsible);
    const approver = one<{ first_name?: string; last_name?: string }>(report.approver);
    const unit = one<{ name?: string }>(report.business_units);
    const category = one<{ name?: string }>(line.expense_categories);
    const center = one<{ name?: string }>(line.cost_centers);
    const attachments = ((line.petty_cash_line_attachments as Array<{ original_name?: string; deleted_at?: string | null }>) ?? []).filter((item) => !item.deleted_at);
    return {
      correlativo: String(report.report_number ?? "Borrador"), trabajador: `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim(),
      unidad: unit?.name ?? "", semana: `${String(report.week_start)} / ${String(report.week_end)}`, fecha_gasto: line.expense_date,
      comercio: line.merchant_name, tipo_documento: line.document_type, numero_documento: line.document_number ?? "",
      categoria: category?.name ?? "", centro_costo: center?.name ?? "", descripcion: line.description,
      monto: Number(line.amount), estado: String(report.status ?? ""), administrador: `${approver?.first_name ?? ""} ${approver?.last_name ?? ""}`.trim(),
      fecha_aprobacion: report.approved_at ? String(report.approved_at) : "", observaciones: line.observation ?? "",
      comprobante: attachments.map((item) => item.original_name).filter(Boolean).join("; "),
    };
  });
}
function one<T>(value: unknown): T | undefined { return (Array.isArray(value) ? value[0] : value) as T | undefined; }
