import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261112144542_lodging_update_reservation_guest.sql"),
  "utf8",
);

describe("datos del huésped en una reserva ya creada", () => {
  it("exige permiso, hostal de la reserva y reserva vigente", () => {
    expect(sql).toContain("has_permission('lodging.reservations.manage')");
    expect(sql).toContain("can_access_unit(r.company_id,r.business_unit_id)");
    expect(sql).toContain("r.status in('cancelled','conflict')");
  });

  it("valida nombre, teléfono y correo en la base", () => {
    expect(sql).toContain("char_length(v_name)<3");
    expect(sql).toContain("char_length(v_phone)<6");
    expect(sql).toContain("Correo invalido");
  });

  it("audita solo los nombres de los campos cambiados, no sus valores", () => {
    expect(sql).toContain("jsonb_build_object('changed_fields',to_jsonb(changed))");
    expect(sql).not.toMatch(/new_data\)\s*values[^;]*v_(name|phone|email|doc)/);
  });

  it("solo la ejecutan usuarios con sesión", () => {
    expect(sql).toContain("revoke execute on function public.lodging_update_reservation_guest(uuid,jsonb) from public,anon");
    expect(sql).toContain("grant execute on function public.lodging_update_reservation_guest(uuid,jsonb) to authenticated");
  });
});
