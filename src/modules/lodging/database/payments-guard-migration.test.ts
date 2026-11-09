import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("control de pagos, devoluciones y retenidos", () => {
  const sql = readFileSync("supabase/migrations/20261109133026_lodging_payments_guard_refunds_retained.sql", "utf8");

  it("controla hostal, reserva anulada, fecha futura y cierre emitido al registrar pagos", () => {
    expect(sql).toContain("create trigger lodging_payment_guard before insert or update of paid_at,reservation_id,business_unit_id,company_id");
    expect(sql).toContain("raise exception 'El pago debe ser del mismo hostal que la reserva'");
    expect(sql).toContain("raise exception 'La reserva esta anulada: no se registran pagos nuevos'");
    expect(sql).toContain("raise exception 'La fecha del pago no puede ser futura'");
    expect(sql).toContain("raise exception 'El cierre de ese dia ya fue emitido: registra el pago con la fecha de hoy'");
  });

  it("devolver registra la devolución el día en que se hace", () => {
    expect(sql).toContain("select v_res.company_id,v_res.business_unit_id,v_res.id,'refund',payment_method,net,now()");
    expect(sql).not.toContain("'refunded'");
  });

  it("al aprobar con pagos sin decisión, la decide quien aprueba", () => {
    expect(sql).toContain("drop function public.lodging_reservation_cancel_decide(uuid,boolean,text);");
    expect(sql).toContain("grant execute on function public.lodging_reservation_cancel_decide(uuid,boolean,text,text,uuid) to authenticated;");
  });

  it("los pagos retenidos suman al ingreso del mes y Lucía no vence retenciones con pagos", () => {
    expect(sql).toContain("(select amount from sales)+(select amount from retained)+coalesce(");
    expect(sql).toContain("pg_get_functiondef('public.lucia_expire_holds(uuid)'::regprocedure)");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
