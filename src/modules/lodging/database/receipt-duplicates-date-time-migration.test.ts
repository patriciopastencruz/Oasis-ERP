import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261029225146_lodging_receipt_duplicates_by_date_and_time.sql", "utf8");

describe("comprobantes repetidos por fecha y hora", () => {
  it("guarda la hora leída y ya no compara el número de operación (suele ser la cuenta de destino)", () => {
    expect(sql).toContain("add column ai_detected_time text");
    expect(sql).not.toContain("'op'");
    expect(sql).toContain("r.ai_detected_amount::bigint::text||'|'||r.ai_detected_date::text||'|'||r.ai_detected_time");
  });
  it("marca el mismo comprobante en reservas con fechas distintas, o los pagos que superan lo que cubre", () => {
    expect(sql).toContain("dates>1 or (rec is not null and total>rec*1.01+50)");
    expect(sql).toContain("count(distinct check_in) dates");
  });
  it("mantiene permisos, RLS y que el aviso sea solo del servidor", () => {
    expect(sql).toContain("with (security_invoker=on)");
    expect(sql).toContain("public.has_permission('lodging.receipts.review') or public.has_permission('lodging.closings.reports')");
    expect(sql).toContain("grant execute on function public.lodging_receipt_duplicates(uuid,date,date,uuid) to authenticated");
    expect(sql).toContain("revoke execute on function public.lodging_notify_receipt_duplicate(uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.lodging_notify_receipt_duplicate(uuid) to service_role");
    expect(sql).not.toMatch(/delete from|drop table|truncate/i);
  });
  it("tiene índice para comparar monto, fecha y hora", () => {
    expect(sql).toContain("lodging_payment_receipts_content_idx");
  });
});
