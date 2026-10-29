import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261029221919_lodging_receipt_duplicate_detection.sql", "utf8");

describe("detección de comprobantes repetidos", () => {
  it("guarda la huella del archivo y normaliza el número de operación", () => {
    expect(sql).toContain("add column file_sha256 text");
    expect(sql).toContain("function public.lodging_op_key");
    expect(sql).toContain("char_length(regexp_replace(lower(coalesce(op,'')),'[^a-z0-9]','','g'))>=6");
  });
  it("solo marca cuando los pagos suman más que el comprobante o no se puede comprobar", () => {
    expect(sql).toContain("rec is null or total>rec*1.01+50");
  });
  it("la consulta respeta RLS y exige permiso de revisión o de reportes de cierres", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("public.has_permission('lodging.receipts.review') or public.has_permission('lodging.closings.reports')");
    expect(sql).toContain("grant execute on function public.lodging_receipt_duplicates(uuid,date,date,uuid) to authenticated");
    expect(sql).toContain("with (security_invoker=on)");
  });
  it("el aviso solo lo puede llamar el servidor, sin repetirse por comprobante", () => {
    expect(sql).toContain("revoke execute on function public.lodging_notify_receipt_duplicate(uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.lodging_notify_receipt_duplicate(uuid) to service_role");
    expect(sql).toContain("event_key='lodging.receipt.duplicate' and entity_id=r.id");
  });
  it("tiene índices para las búsquedas y no borra datos", () => {
    for (const idx of ["lodging_payment_receipts_sha_idx", "lodging_payment_receipts_opkey_idx", "lodging_reservation_payments_opkey_idx"]) expect(sql).toContain(idx);
    expect(sql).not.toMatch(/delete from|drop table|truncate/i);
  });
});
