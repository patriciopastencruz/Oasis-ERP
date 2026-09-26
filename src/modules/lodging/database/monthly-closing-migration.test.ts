import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260926034507_lodging_monthly_management_closing.sql"),
  "utf8",
);
const fn = (name: string) => sql.split(`function public.${name}(`)[1]?.split("end $$;")[0] ?? "";

describe("esquema del cierre mensual gerencial", () => {
  it("crea tablas con compañía, unidad, RLS y auditoría", () => {
    for (const table of ["lodging_finance_categories", "lodging_monthly_closings", "lodging_monthly_closing_lines"]) {
      const body = sql.split(`create table public.${table}(`)[1]?.split(");")[0] ?? "";
      expect(body).toContain("company_id uuid not null");
      expect(body).toContain("business_unit_id uuid not null");
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`create trigger audit_${table}`);
    }
    expect(sql).toContain("unique(business_unit_id,period)");
  });

  it("solo concede lectura; las escrituras pasan por funciones", () => {
    expect(sql).toContain(
      "grant select on public.lodging_finance_categories,public.lodging_monthly_closings,public.lodging_monthly_closing_lines to authenticated",
    );
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*lodging_monthly/i);
    expect(sql).toContain("revoke execute on function public.lodging_monthly_summary_internal(uuid,date) from public,anon,authenticated");
  });

  it("calcula los totales en PostgreSQL desde pagos, comisiones, cierres diarios emitidos y líneas", () => {
    const summary = sql.split("function public.lodging_monthly_summary_internal(")[1] ?? "";
    expect(summary).toContain("p.status='confirmed'");
    expect(summary).toContain("case when p.type='refund' then -p.amount else p.amount end");
    expect(summary).toContain("d.status='issued'");
    expect(summary).toContain("r.commission");
    expect(summary).toContain("'profit',t.income-t.fixed-t.variable-t.investment-t.withdrawal-t.other");
    expect(fn("lodging_monthly_close")).toContain("snapshot=public.lodging_monthly_summary_internal");
    expect(fn("lodging_monthly_save_line")).not.toContain("payload->>'total");
  });

  it("valida permiso de gestión y unidad en cada mutación", () => {
    for (const name of [
      "lodging_monthly_start",
      "lodging_monthly_save_line",
      "lodging_monthly_delete_line",
      "lodging_monthly_toggle_line_status",
      "lodging_monthly_close",
      "lodging_monthly_reopen",
      "lodging_finance_category_create",
      "lodging_finance_category_toggle",
    ]) {
      const body = fn(name);
      expect(body).toContain("public.has_permission('lodging.monthly_closing.manage')");
      expect(body).toMatch(/can_access_unit|lodging_monthly_assert_unit/);
    }
    expect(fn("lodging_monthly_delete_line")).toContain("set deleted_at=now()");
  });

  it("exige categoría habilitada en los gastos del cierre diario", () => {
    const save = fn("lodging_save_daily_closing");
    expect(save).toContain("fc.allow_daily");
    expect(save).toContain("'Cada gasto requiere una categoria valida'");
  });
});
