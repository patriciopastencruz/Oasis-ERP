import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928151625_edit_lodging_reservation_dates.sql",
  ),
  "utf8",
);

describe("edición segura de fechas de una reserva", () => {
  it("comprueba permiso, unidad y estado dentro de PostgreSQL", () => {
    expect(sql).toContain("has_permission('lodging.reservations.manage')");
    expect(sql).toContain("can_access_unit(r.company_id, r.business_unit_id)");
    expect(sql).toContain("'cancelled', 'checked_in', 'checked_out'");
  });

  it("protege las fechas administradas por iCal", () => {
    expect(sql).toContain("if r.imported_from_ical then");
  });

  it("recalcula el total y deja auditoría", () => {
    expect(sql).toContain("new.check_out - new.check_in");
    expect(sql).toContain("new.total_value :=");
    expect(sql).toContain("guard_lodging_reservation_date_change");
    expect(sql).toContain("audit_lodging_reservation_date_change");
    expect(sql).toContain("'update_reservation_dates'");
  });

  it("expone la operación solo a usuarios autenticados", () => {
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
  });
});
