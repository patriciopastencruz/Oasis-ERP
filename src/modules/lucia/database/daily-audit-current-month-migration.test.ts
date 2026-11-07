import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reporte diario de Lucía: solo el mes del cierre", () => {
  const sql = readFileSync("supabase/migrations/20261107035357_lucia_daily_audit_current_month.sql", "utf8");
  it("cuenta comprobantes y saldos desde el día 1 del mes", () => {
    expect(sql).toContain("between date_trunc('month', target_date)::date and target_date");
    expect(sql).toContain("r.check_out > date_trunc('month', target_date)::date");
  });
  it("modifica la función existente sin reemplazarla completa", () => {
    expect(sql).toContain("pg_get_functiondef('public.lucia_daily_audit_message(uuid,date)'::regprocedure)");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});
