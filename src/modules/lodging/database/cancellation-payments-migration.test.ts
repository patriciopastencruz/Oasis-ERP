import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("decidir qué pasa con los pagos al anular una reserva", () => {
  const sql = readFileSync("supabase/migrations/20261107171700_lodging_cancellation_payments_decision.sql", "utf8");

  it("exige la decisión cuando hay pagos y la guarda en la solicitud", () => {
    expect(sql).toContain("add column payments_action text check (payments_action in ('void','refund','move','retain'))");
    expect(sql).toContain("perform public.lodging_cancelled_payments_check(v_res,v_action,payments_move_to);");
    expect(sql).toContain("drop function public.lodging_reservation_cancel_request(uuid,text);");
  });

  it("anular o devolver pagos sin permiso pasa a aprobación", () => {
    expect(sql).toContain(
      "if v_action in('void','refund') and not (public.has_permission('lodging.reservations.cancel_approve') or public.has_permission('lodging.payments.void')) then",
    );
  });

  it("los pagos retenidos cuentan como ingreso", () => {
    expect(sql).toContain("add column payments_retained boolean not null default false");
    expect(sql).toContain("(r.status not in('cancelled','conflict') or r.payments_retained))");
    expect(sql).toContain("r.status in('cancelled','conflict') and not r.payments_retained)");
  });

  it("permite resolver después los pagos de una reserva anulada, con permisos y auditoría", () => {
    expect(sql).toContain("create or replace function public.lodging_cancelled_payments_settle(");
    expect(sql).toContain("grant execute on function public.lodging_cancelled_payments_settle(uuid,text,uuid,text) to authenticated;");
    expect(sql).toContain("'cancelled_payments_'||v_action");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
