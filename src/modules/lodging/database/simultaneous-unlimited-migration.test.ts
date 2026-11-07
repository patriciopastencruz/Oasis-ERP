import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sobre-reserva sin límite y automática con check-in", () => {
  const sql = readFileSync("supabase/migrations/20261107031611_lodging_simultaneous_unlimited.sql", "utf8");

  it("deja las reservas simultáneas fuera de la restricción de cruce", () => {
    expect(sql).toContain("drop constraint if exists lodging_reservations_no_overlap_excl");
    expect(sql).toContain("where (status not in ('cancelled', 'conflict') and not simultaneous)");
    expect(sql).not.toContain("((simultaneous)::int) with =");
  });

  it("marca como simultánea la reserva sobre una pieza con check-in aunque no se marque la casilla", () => {
    expect(sql).toContain("pg_get_functiondef('public.create_lodging_reservation(jsonb)'::regprocedure)");
    expect(sql).toContain("c.status='checked_in'");
    expect(sql).toContain("raise exception 'create_lodging_reservation cambió");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
