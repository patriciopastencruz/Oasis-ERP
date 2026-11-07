import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("el ingreso no cuenta pagos de reservas anuladas", () => {
  const sql = readFileSync("supabase/migrations/20261107032617_lodging_income_excludes_cancelled_payments.sql", "utf8");

  it("filtra los pagos del cierre diario y del cierre mensual", () => {
    expect(sql).toContain("pg_get_functiondef('public.lodging_closing_base_metrics_internal(uuid,date)'::regprocedure)");
    expect(sql).toContain("pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure)");
    expect(sql).toContain("and r.status not in('cancelled','conflict'))");
    expect(sql).toContain("raise exception 'lodging_monthly_summary_internal cambió");
  });

  it("recalcula los cierres mensuales en preparación", () => {
    expect(sql).toContain("select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
