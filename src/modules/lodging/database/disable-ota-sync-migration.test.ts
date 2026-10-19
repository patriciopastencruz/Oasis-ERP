import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261019170000_lodging_disable_ota_calendar_sync.sql", "utf8");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };

describe("calendario manual: sin conexión con Booking y Airbnb", () => {
  it("desactiva la importación y los enlaces de exportación sin borrar datos", () => {
    expect(sql).toContain("update public.lodging_ical_configs set active=false");
    expect(sql).toContain("update public.lodging_rooms set export_enabled=false");
    expect(sql).not.toMatch(/delete from|drop table|truncate/i);
  });
  it("ya no se programa la sincronización diaria de iCal", () => {
    expect(vercel.crons.map((c) => c.path)).not.toContain("/api/cron/lodging-ical");
    expect(vercel.crons.length).toBeGreaterThan(0);
  });
});
