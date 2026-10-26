import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261026195320_lodging_closing_room_service_by_date.sql", "utf8");

describe("cierre diario: habitaciones según su estado ese día", () => {
  it("una habitación fuera de servicio hoy cuenta en un día pasado si estaba en servicio o tenía noche vendida", () => {
    expect(sql).toContain("create or replace function public.lodging_room_out_of_service_on(");
    expect(sql).not.toContain("r.status not in('out_of_service','maintenance')");
    expect(sql.match(/lodging_room_out_of_service_on\(r\.id,target_date\)/g)).toHaveLength(2);
  });
  it("solo cambia el cálculo: no borra ni reescribe cierres guardados", () => {
    expect(sql).not.toMatch(/delete from|drop table|truncate|update public\.lodging_daily_closings/i);
    expect(sql).toContain("revoke execute on function public.lodging_room_out_of_service_on(uuid,date) from public,anon,authenticated");
  });
});
