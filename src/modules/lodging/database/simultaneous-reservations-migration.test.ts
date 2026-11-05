import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reservas simultáneas", () => {
  const sql = readFileSync("supabase/migrations/20261105150541_lodging_simultaneous_reservations.sql", "utf8");
  it("la marca entra en la clave del exclusion constraint, así que solo cabe una simultánea por habitación", () => {
    expect(sql).toContain("add column simultaneous boolean not null default false");
    expect(sql).toContain("((simultaneous)::int) with =");
    expect(sql).toContain("where (status not in ('cancelled', 'conflict'))");
  });
  it("create_lodging_reservation solo marca la reserva si pidió el cruce y de verdad se cruza con una manual activa", () => {
    expect(sql).toContain("(payload->>'allow_overlap')::boolean");
    expect(sql).toContain("not o.imported_from_ical");
    expect(sql).toContain("pg_get_functiondef('public.create_lodging_reservation(jsonb)'::regprocedure)");
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/);
  });
});
