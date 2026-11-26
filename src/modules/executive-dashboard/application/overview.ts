import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { approvableSteps } from "@/modules/finance/payment-control/application/approval-queries";
import { loadGroupWeeklyReport } from "@/modules/lodging/application/group-weekly-queries";
import { addDays, defaultClosingDate, santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { revparGoal } from "@/modules/lodging/domain/report-goals";
import { lastMonthKeys } from "../domain/months";
import { requirePermission } from "@/modules/platform/auth/application/session";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Cada bloque falla por separado: si uno no carga, el resto del resumen se sigue viendo. */
async function safe<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[inicio] ${label}`, error);
    return null;
  }
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count: total, error } = await query;
  if (error) throw new Error(error.message);
  return total ?? 0;
}

/** Resumen ejecutivo de todos los negocios a los que tiene acceso la persona (RLS limita lo demás). */
export async function executiveOverview() {
  const ctx = await requirePermission("reports.executive_dashboard.view");
  const supabase = await createSupabaseServerClient();
  const today = santiagoToday();
  const monthFrom = `${today.slice(0, 8)}01`;
  const has = (permission: string) => ctx.permissions.has(permission);
  const unit = (code: string) => ctx.units.find((u) => u.code === code);

  const [approvals, hostels, expenses, modulares, distribution, finance] = await Promise.all([
    safe("aprobaciones", () => loadApprovals(supabase, has)),
    safe("hostales", () => loadHostels(supabase, ctx.units, has("kpis.view"), today)),
    safe("gastos", () => loadExpenses(supabase, ctx.units, has("lodging.expenses.view"), today)),
    safe("modulares", () => loadModulares(supabase, has, today)),
    safe("distribuidora", async () => {
      const da = unit("DA");
      if (!da || !has("finance.distribution.view")) return null;
      const { data, error } = await supabase.rpc("dist_daily_summary", { target_unit: da.id, target_date: today });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Record<string, number>;
      return { unitName: da.name, orders: d.orders_total ?? 0, delivered: d.delivered ?? 0, pending: d.pending ?? 0, sales: d.planned_sales ?? 0 };
    }),
    safe("finanzas", async () => {
      const rows = await Promise.all(
        ctx.companies.map(async (company) => {
          const { data, error } = await supabase.rpc("executive_payment_summary", { date_from: monthFrom, date_to: today, filter_company: company.id });
          if (error) throw new Error(error.message);
          return (data?.[0] ?? {}) as Record<string, number>;
        }),
      );
      const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
      return { requested: sum("total_requested"), approved: sum("total_approved"), paid: sum("total_paid"), pending: sum("total_pending"), overdue: sum("overdue_count") };
    }),
  ]);

  return { ctx, today, approvals, hostels, expenses, modulares, distribution, finance, canOpenApprovals: has("administration.approvals.view") };
}

async function loadApprovals(supabase: Supabase, has: (permission: string) => boolean) {
  const head = { count: "exact", head: true } as const;
  const items = await Promise.all([
    has("finance.approvals.decide") ? approvableSteps().then((steps) => ({ label: "Solicitudes de pago", n: steps.length })) : null,
    has("sales.quotations.approve")
      ? count(supabase.from("om_quotations").select("id", head).eq("status", "pending").is("deleted_at", null)).then((n) => ({ label: "Cotizaciones", n }))
      : null,
    has("finance.petty_cash.review")
      ? count(supabase.from("petty_cash_reports").select("id", head).in("status", ["submitted", "resubmitted", "under_review"]).is("deleted_at", null)).then((n) => ({ label: "Caja chica", n }))
      : null,
    has("inventory.approvals.decide")
      ? count(supabase.from("inventory_change_requests").select("id", head).eq("status", "pending")).then((n) => ({ label: "Inventario", n }))
      : null,
    has("finance.distribution.requests.review")
      ? count(supabase.from("dist_change_requests").select("id", head).in("status", ["pending", "in_review"])).then((n) => ({ label: "Distribuidora", n }))
      : null,
    has("lodging.reservations.cancel_approve")
      ? count(supabase.from("lodging_reservation_cancellations").select("id", head).eq("status", "pending")).then((n) => ({ label: "Anulaciones de reservas", n }))
      : null,
    has("lodging.closings.authorize")
      ? count(supabase.from("lodging_closing_authorizations").select("id", head).eq("status", "pending")).then((n) => ({ label: "Cierres diarios", n }))
      : null,
  ]);
  const rows = items.filter((item): item is { label: string; n: number } => item !== null);
  return { rows, total: rows.reduce((sum, row) => sum + row.n, 0) };
}

async function loadHostels(supabase: Supabase, units: { id: string; code: string; name: string }[], allowed: boolean, today: string) {
  const own = ["HOC", "HOB", "HU"].map((code) => units.find((u) => u.code === code)).filter((u): u is NonNullable<typeof u> => !!u);
  if (!allowed || !own.length) return null;
  const report = await loadGroupWeeklyReport(supabase, own, today, defaultClosingDate());
  const sum = (pick: (m: (typeof report.hostels)[number]["month"]) => number) => report.hostels.reduce((total, h) => total + pick(h.month), 0);
  const roomNights = sum((m) => m.roomNights);
  const soldNights = sum((m) => m.soldNights);
  const month = {
    occupancy: roomNights ? sum((m) => m.nightsSold) / roomNights : 0,
    adr: soldNights ? sum((m) => m.soldRevenue) / soldNights : 0,
    revpar: roomNights ? sum((m) => m.revenue) / roomNights : 0,
    revenue: sum((m) => m.revenue),
  };
  const rows = report.hostels.map((h) => {
    const last = h.month.days.at(-1);
    const day = last?.date === today ? last : null;
    return {
      id: h.unit.id,
      code: h.unit.code,
      name: h.unit.name.replace(/^Hostal\s+(Oasis\s+)?/i, ""),
      occupied: day?.occupied ?? 0,
      capacity: day?.capacity ?? 0,
      received: day?.received ?? 0,
      pending: h.balances.rows.filter((r) => r.check_in <= today && r.check_out > today).reduce((total, r) => total + r.balance, 0),
      pendingClosings: h.pendingClosings.length,
      month: { revenue: h.month.revenue, occupancy: h.month.occupancy, adr: h.month.adr, revpar: h.month.revpar },
      goals: { occupancy: h.goals.occupancyPct, adr: h.goals.averageRate, revpar: revparGoal(h.goals) },
    };
  });
  return { month, rows };
}

/** Gasto declarado del mes (fuente oficial; los gastos del cierre diario no se suman): total, por hostal y por tipo. */
async function loadExpenses(supabase: Supabase, units: { id: string; code: string; name: string }[], allowed: boolean, today: string) {
  const own = ["HOC", "HOB", "HU"].map((code) => units.find((u) => u.code === code)).filter((u): u is NonNullable<typeof u> => !!u);
  if (!allowed || !own.length) return null;
  const start = `${today.slice(0, 8)}01`;
  const { data, error } = await supabase
    .from("lodging_expenses")
    .select("business_unit_id,amount,lodging_finance_categories(name)")
    .in("business_unit_id", own.map((u) => u.id))
    .gte("expense_date", start)
    .lte("expense_date", today)
    .is("voided_at", null)
    .limit(5000);
  if (error) throw new Error(error.message);
  const byUnit = new Map<string, number>();
  const byCategory = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    const amount = Number(row.amount);
    const cat = Array.isArray(row.lodging_finance_categories) ? row.lodging_finance_categories[0] : row.lodging_finance_categories;
    const name = cat?.name ?? "Sin clasificar";
    byUnit.set(row.business_unit_id, (byUnit.get(row.business_unit_id) ?? 0) + amount);
    const cats = byCategory.get(row.business_unit_id) ?? new Map<string, number>();
    cats.set(name, (cats.get(name) ?? 0) + amount);
    byCategory.set(row.business_unit_id, cats);
  }
  const short = (name: string) => name.replace(/^Hostal\s+(Oasis\s+)?/i, "");
  return {
    units: own.map((u) => ({
      id: u.id,
      code: u.code,
      name: short(u.name),
      total: byUnit.get(u.id) ?? 0,
      categories: [...(byCategory.get(u.id) ?? new Map<string, number>())].map(([name, total]) => ({ name, total })),
    })),
  };
}

async function loadModulares(supabase: Supabase, has: (permission: string) => boolean, today: string) {
  const head = { count: "exact", head: true } as const;
  const [projects, requests, lists, quotations] = await Promise.all([
    has("sales.projects.view")
      ? count(supabase.from("om_projects").select("id", head).in("status", ["pending", "manufacturing", "installation"]).is("deleted_at", null))
      : null,
    has("inventory.supply.consolidate") ? count(supabase.from("om_supply_requests").select("id", head).eq("status", "submitted")) : null,
    has("inventory.supply.consolidate") ? count(supabase.from("om_supply_purchase_lists").select("id", head).eq("status", "issued")) : null,
    has("sales.quotations.create") || has("sales.quotations.approve") ? loadQuotations(supabase, today) : null,
  ]);
  if (projects === null && requests === null && quotations === null) return null;
  return { projects, requests, lists, quotations };
}

const santiagoMonth = (timestamp: string) => new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "America/Santiago" }).slice(0, 7);

/** Cotizaciones de Modulares emitidas (no borradores) por mes, con lo cotizado y lo aprobado del mes en curso. */
async function loadQuotations(supabase: Supabase, today: string) {
  const keys = lastMonthKeys(today, 6);
  const { data, error } = await supabase
    .from("om_quotations")
    .select("status,total,created_at,submitted_at")
    .is("deleted_at", null)
    .neq("status", "draft")
    .gte("created_at", addDays(`${keys[0]}-01`, -1))
    .limit(5000);
  if (error) throw new Error(error.message);
  const pending = await count(supabase.from("om_quotations").select("id", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null));
  const months = keys.map((key) => ({ key, count: 0, amount: 0, approved: 0 }));
  for (const row of data ?? []) {
    const month = months.find((m) => m.key === santiagoMonth(row.submitted_at ?? row.created_at));
    if (!month) continue;
    month.count += 1;
    month.amount += Number(row.total ?? 0);
    if (row.status === "approved" || row.status === "delivered") month.approved += 1;
  }
  return { months, pending, current: months[months.length - 1], previous: months[months.length - 2] };
}
