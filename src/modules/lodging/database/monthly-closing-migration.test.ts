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

describe("tipos de gasto de Hostal Uruguay: arriendo y otros gastos fijos", () => {
  const sql = readFileSync("supabase/migrations/20261102165522_lodging_expense_types_rent_other_fixed.sql", "utf8");
  it("agrega Arriendo y Otros gastos fijos como gasto fijo de Uruguay, disponibles en Gastos", () => {
    expect(sql).toContain("('Arriendo',14)");
    expect(sql).toContain("('Otros gastos fijos',90)");
    expect(sql).toContain("u.code='HU'");
    expect(sql).toContain("'fixed'");
    expect(sql).toContain("allow_expenses=true");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});

describe("tipos de gasto de Centro y Cobija: arriendo y otros gastos fijos", () => {
  const sql = readFileSync("supabase/migrations/20261102165753_lodging_expense_types_rent_other_fixed_centro_cobija.sql", "utf8");
  it("agrega Arriendo y Otros gastos fijos como gasto fijo de Centro y Cobija, disponibles en Gastos", () => {
    expect(sql).toContain("('Arriendo',14)");
    expect(sql).toContain("('Otros gastos fijos',90)");
    expect(sql).toContain("u.code in('HOC','HOB')");
    expect(sql).toContain("allow_expenses=true");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});

describe("cierre mensual: gastos declarados", () => {
  const sql = readFileSync("supabase/migrations/20261102170152_lodging_monthly_closing_declared_expenses.sql", "utf8");
  it("toma los gastos no anulados del módulo Gastos y no suma los de cierres diarios cuando hay declarados", () => {
    expect(sql).toContain("from public.lodging_expenses e");
    expect(sql).toContain("e.voided_at is null");
    expect(sql).toContain("select section,amount from daily where not (select use_declared from expense_source)");
    expect(sql).toContain("'expenses_source'");
    expect(sql).toContain("'daily_reference'");
    expect(sql).toContain("lodging_monthly_refresh_totals(id)");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});

describe("cierre mensual: detalle de gastos declarados", () => {
  const sql = readFileSync("supabase/migrations/20261102183156_lodging_monthly_closing_declared_items.sql", "utf8");
  it("entrega cada gasto declarado con su nombre sin cambiar los totales por categoría", () => {
    expect(sql).toContain("'description',e.description");
    expect(sql).toContain("'items',items");
    expect(sql).toContain("e.voided_at is null");
    expect(sql).toContain("select section,amount from daily where not (select use_declared from expense_source)");
    expect(sql).toContain("lodging_monthly_refresh_totals(id)");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});
