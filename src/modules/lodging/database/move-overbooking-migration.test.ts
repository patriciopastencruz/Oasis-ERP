import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mover una reserva con sobre-reserva", () => {
  const sql = readFileSync("supabase/migrations/20261123121212_lodging_move_reservation_overbooking.sql", "utf8");
  it("pide permiso y unidad, y valida estado y habitación como el cambio directo", () => {
    expect(sql).toContain("public.has_permission('lodging.reservations.manage')");
    expect(sql).toContain("public.can_access_unit(r.company_id,r.business_unit_id)");
    expect(sql).toContain("r.status in('cancelled','conflict','checked_out')");
    expect(sql).toContain("business_unit_id=r.business_unit_id and active");
  });
  it("sin confirmación rechaza el cruce con un mensaje propio, y con confirmación marca la reserva como simultánea", () => {
    expect(sql).toContain("raise exception 'Sobre-reserva: la habitacion ya esta reservada en esas fechas'");
    expect(sql).toContain("room_id=dest.id, simultaneous=true");
    expect(sql).toContain("room_id=dest.id, simultaneous=false");
    expect(sql).toContain("'move_overbooked'");
  });
  it("las importadas por iCal no entran en la lógica y la guarda solo se relaja dentro de la función", () => {
    expect(sql).toContain("if r.imported_from_ical then");
    expect(sql).toContain("pg_get_functiondef('public.lodging_reservation_move_guard()'::regprocedure)");
    expect(sql).toContain("current_setting('oasis.lodging_move_overlap',true)");
    expect(sql).toContain("grant execute on function public.move_lodging_reservation(uuid,uuid,boolean) to authenticated");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});
