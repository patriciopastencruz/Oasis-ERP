import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("el ingreso del cierre mensual es la venta de las reservas", () => {
  const sql = readFileSync("supabase/migrations/20261107033556_lodging_monthly_income_from_reservations.sql", "utf8");

  it("calcula la venta por noches del mes de las reservas vigentes, hasta hoy", () => {
    expect(sql).toContain("pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure)");
    expect(sql).toContain("s.total_value/greatest(1,s.check_out-s.check_in) as per_night");
    expect(sql).toContain("least(s.check_out,b.next_date,(now() at time zone 'America/Santiago')::date+1)");
    expect(sql).toContain("(select amount from sales)+coalesce((select sum(amount) from lines where section='income'),0)");
  });

  it("deja los pagos como referencia con las reservas que no cuadran y los pagos en anuladas", () => {
    expect(sql).toContain("'reconciliation',jsonb_build_object(");
    expect(sql).toContain("from mismatches where paid<>total_value");
    expect(sql).toContain("r.status in('cancelled','conflict')");
  });

  it("recalcula los cierres en preparación y va dentro de una transacción", () => {
    expect(sql).toContain("select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';");
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
