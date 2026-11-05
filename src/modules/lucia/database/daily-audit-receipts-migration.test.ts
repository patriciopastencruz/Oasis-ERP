import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reporte diario de Lucía: brecha de comprobantes", () => {
  const sql = readFileSync("supabase/migrations/20261105124757_lucia_daily_audit_missing_receipts.sql", "utf8");
  it("lista los pagos confirmados sin comprobante, con pieza, huésped y monto", () => {
    expect(sql).toContain("p.status = 'confirmed'");
    expect(sql).toContain("not exists (select 1 from public.lodging_payment_receipts pr where pr.payment_id = p.id and pr.deleted_at is null)");
    expect(sql).toContain("Brecha en comprobantes");
    expect(sql).toContain("p.payment_method <> 'airbnb'");
  });
  it("modifica la función existente sin reemplazarla completa", () => {
    expect(sql).toContain("pg_get_functiondef('public.lucia_daily_audit_message(uuid,date)'::regprocedure)");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});
