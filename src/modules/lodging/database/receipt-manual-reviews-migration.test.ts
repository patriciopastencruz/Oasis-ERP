import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261029134546_lodging_receipt_manual_reviews.sql", "utf8");

describe("revisión manual de comprobantes", () => {
  it("guarda quién, cuándo, resultado y comentario, con RLS y sin escritura directa", () => {
    expect(sql).toContain("create table public.lodging_receipt_reviews");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.lodging_receipt_reviews from public,anon,authenticated");
    expect(sql).toContain("grant select on public.lodging_receipt_reviews to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete)/i);
    expect(sql).toContain("char_length(btrim(comment)) between 3 and 500");
    expect(sql).toContain("audit_row_change");
  });
  it("valida el permiso, el acceso al hostal y el resultado dentro de la función", () => {
    expect(sql).toContain("public.has_permission('lodging.receipts.review')");
    expect(sql).toContain("public.can_access_unit(r.company_id,r.business_unit_id)");
    expect(sql).toContain("p_outcome not in('ok','corrected','escalated','pending_receipt')");
    expect(sql).toContain("grant execute on function public.lodging_review_receipts(uuid,text,text) to authenticated");
  });
  it("indexa las consultas por reserva, hostal y revisor y no borra datos", () => {
    expect(sql).toContain("lodging_receipt_reviews_reservation_idx");
    expect(sql).toContain("lodging_receipt_reviews_unit_idx");
    expect(sql).toContain("lodging_receipt_reviews_reviewer_idx");
    expect(sql).not.toMatch(/delete from|drop table|truncate/i);
  });
});
