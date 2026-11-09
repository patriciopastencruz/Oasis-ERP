import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reglas de simultáneas, cambio de pieza y check-in", () => {
  const sql = readFileSync("supabase/migrations/20261109144411_lodging_simultaneous_checkin_rules.sql", "utf8");

  it("una simultánea no cruza reservas nuevas al moverse y deja de serlo si ya no cruza nada", () => {
    expect(sql).toContain("create trigger lodging_reservation_move_guard before update of room_id,check_in,check_out on public.lodging_reservations");
    expect(sql).toContain("new.simultaneous:=false;");
    expect(sql).toContain("raise exception 'La habitacion ya esta reservada en esas fechas';");
  });

  it("la marca automática exige que todo lo que cruza tenga check-in", () => {
    expect(sql).toContain("f.status not in('cancelled','conflict','checked_in')");
  });

  it("valida capacidad al cambiar de pieza y fechas en el check-in", () => {
    expect(sql).toContain("raise exception 'La habitacion no admite esa cantidad de huespedes'");
    expect(sql).toContain("raise exception 'El check-in se hace entre la fecha de llegada y la de salida';");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
