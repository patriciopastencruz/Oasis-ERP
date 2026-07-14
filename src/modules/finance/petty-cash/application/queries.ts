import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { chileWeek } from "../domain/petty-cash";

export async function pettyCashContext() {
  const ctx = await requireSession();
  const store = await cookies();
  const selected = ctx.units.find((unit) => unit.id === store.get("oasis_unit")?.value) ?? ctx.units[0];
  return { ctx, selected };
}

export async function currentWeekSummary(unitId?: string, responsibleId?: string) {
  if (!unitId) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("petty_cash_week_summary", {
    target_business_unit: unitId,
    target_week: chileWeek().start,
    target_responsible: responsibleId ?? undefined,
  });
  if (error) {
    console.error("[petty-cash-summary]", error.message);
    return null;
  }
  return data as {
    week_start: string; week_end: string; weekly_limit: number; committed: number;
    approved: number; pending: number; available: number; report_count: number;
    line_count: number; attachment_count: number;
  };
}

export async function activeCatalogs() {
  const { ctx } = await pettyCashContext();
  const supabase = await createSupabaseServerClient();
  const companyIds = [...new Set(ctx.units.map((unit) => unit.company_id))];
  const [{ data: categories }, { data: centers }] = await Promise.all([
    supabase.from("expense_categories").select("id,name,company_id,business_unit_id").in("company_id", companyIds).eq("active", true).is("deleted_at", null).order("name"),
    supabase.from("cost_centers").select("id,name,company_id,business_unit_id").in("company_id", companyIds).eq("active", true).is("deleted_at", null).order("name"),
  ]);
  return { categories: categories ?? [], centers: centers ?? [] };
}

export async function loadPettyCashReport(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("petty_cash_reports")
    .select("*,business_units(name),responsible:profiles!petty_cash_reports_responsible_id_fkey(first_name,last_name,email),approver:profiles!petty_cash_reports_approved_by_fkey(first_name,last_name),petty_cash_expense_lines(*,expense_categories(name),cost_centers(name),petty_cash_line_attachments(id,original_name,mime_type,size_bytes,object_path,created_at,deleted_at)),petty_cash_review_actions(*,profiles!petty_cash_review_actions_reviewer_id_fkey(first_name,last_name))")
    .eq("id", id)
    .is("deleted_at", null)
    .order("sort_order", { referencedTable: "petty_cash_expense_lines", ascending: true })
    .single();
  if (error && error.code !== "PGRST116") console.error("[petty-cash-report]", error.message);
  return data;
}

export async function signPettyCashAttachments(report: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const supabase = await createSupabaseServerClient();
  const lines = (report.petty_cash_expense_lines as Array<Record<string, unknown>> | undefined) ?? [];
  return Promise.all(lines.map(async (line): Promise<Record<string, unknown>> => ({
    ...line,
    petty_cash_line_attachments: await Promise.all(
      ((line.petty_cash_line_attachments as Array<Record<string, unknown>> | undefined) ?? [])
        .filter((attachment) => !attachment.deleted_at)
        .map(async (attachment): Promise<Record<string, unknown>> => {
          const { data } = await supabase.storage.from("petty-cash-attachments").createSignedUrl(String(attachment.object_path), 300, { download: String(attachment.original_name) });
          return { ...attachment, url: data?.signedUrl };
        }),
    ),
  })));
}
