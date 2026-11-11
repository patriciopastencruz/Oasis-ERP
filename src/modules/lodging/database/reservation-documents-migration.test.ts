import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261111205813_lodging_reservation_identity_documents.sql"),
  "utf8",
);

describe("documento de identidad en la reserva", () => {
  it("guarda la nacionalidad del huésped al crear la reserva", () => {
    expect(sql).toContain("document,nationality,notes)");
    expect(sql).toContain("payload->>'nationality'");
  });

  it("la tabla lleva compañía, hostal, RLS, auditoría e índices", () => {
    expect(sql).toContain("company_id uuid not null");
    expect(sql).toContain("business_unit_id uuid not null");
    expect(sql).toContain("alter table public.lodging_reservation_documents enable row level security");
    expect(sql).toContain("create trigger audit_lodging_reservation_documents");
    expect(sql).toContain("lodging_reservation_documents_unit_idx");
    expect(sql).toContain("lodging_reservation_documents_uploaded_by_idx");
  });

  it("solo concede lectura al usuario; las escrituras pasan por la función", () => {
    expect(sql).toContain("grant select on public.lodging_reservation_documents to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to authenticated/i);
    expect(sql).toContain("revoke execute on function public.lodging_set_reservation_documents(uuid,text,text) from public,anon");
  });

  it("la función exige permiso, hostal de la reserva y rutas dentro de su carpeta", () => {
    const fn = sql.split("function public.lodging_set_reservation_documents(")[1] ?? "";
    expect(fn).toContain("has_permission('lodging.reservations.manage')");
    expect(fn).toContain("can_access_unit(r.company_id,r.business_unit_id)");
    expect(fn).toContain("r.status in('cancelled','conflict')");
    expect(fn).toContain("left(p_front,char_length(prefix))<>prefix");
    expect(fn).toContain("left(p_back,char_length(prefix))<>prefix");
  });
});
