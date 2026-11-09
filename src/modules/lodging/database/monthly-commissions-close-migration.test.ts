import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("comisiones prorrateadas, cierre del mes en curso y tope de devolución", () => {
  const sql = readFileSync("supabase/migrations/20261109152748_lodging_monthly_commissions_close_refund_cap.sql", "utf8");

  it("prorratea las comisiones por noches del mes", () => {
    expect(sql).toContain("sum(coalesce(commission,0)*month_nights/greatest(1,check_out-check_in))");
  });

  it("no cierra un mes que no ha terminado", () => {
    expect(sql).toContain("raise exception 'El mes todavia no termina'");
  });

  it("no acepta devoluciones mayores a lo pagado", () => {
    expect(sql).toContain("raise exception 'La devolucion no puede superar lo pagado'");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
