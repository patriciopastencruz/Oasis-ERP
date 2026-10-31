import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261031205230_lodging_quotation_edit.sql", "utf8");

describe("edición de cotizaciones de hospedaje", () => {
  it("recalcula totales en la base y deja huella de quién editó", () => {
    expect(sql).toContain("function public.lodging_update_quotation");
    expect(sql).toContain("vat:=round(sub*0.19)");
    expect(sql).toContain("last_edited_by=me,last_edited_at=now()");
  });
  it("exige acceso al hostal y permiso, y no permite editar una anulada", () => {
    expect(sql).toContain("public.can_access_unit(q.company_id,q.business_unit_id)");
    expect(sql).toContain("public.has_permission('lodging.quotations.manage')");
    expect(sql).toContain("if q.status<>'issued' then raise exception 'Una cotizacion anulada no se puede editar'");
  });
  it("no ejecutable por anónimos y no cambia folio, fecha ni hostal", () => {
    expect(sql).toContain("revoke execute on function public.lodging_update_quotation(uuid,jsonb) from public,anon");
    expect(sql).toContain("grant execute on function public.lodging_update_quotation(uuid,jsonb) to authenticated");
    expect(sql).not.toMatch(/set[^;]*quotation_number\s*=/);
    expect(sql).not.toMatch(/set[^;]*issued_on\s*=/);
  });
  it("quitar una foto devuelve la ruta y el borrado del archivo usa la misma regla de acceso", () => {
    expect(sql).toContain("function public.lodging_quotation_photo_remove");
    expect(sql).toContain("for delete to authenticated");
    expect(sql).toContain("public.lodging_quotation_storage_access(name)");
  });
});
