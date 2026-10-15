import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261016120000_lodging_reception_bonus.sql", "utf8");
const rules = readFileSync("supabase/migrations/20261016130000_lodging_bonus_binary_rules.sql", "utf8");

describe("migración del bono de recepción", () => {
  it("protege las tablas con RLS y sin escritura directa", () => {
    expect(sql).toContain("alter table public.lodging_bonus_config enable row level security");
    expect(sql).toContain("alter table public.lodging_bonus_results enable row level security");
    expect(sql).toContain("revoke all on public.lodging_bonus_config,public.lodging_bonus_results from public,anon,authenticated");
    expect(sql).not.toContain("using(true)");
  });
  it("solo quien tiene el permiso de gestión configura y guarda", () => {
    expect(sql.match(/has_permission\('kpis\.bonus\.manage'\)/g)?.length).toBe(2);
    expect(sql).toContain("Los pesos deben sumar 100");
    expect(sql).toContain("Solo se guarda el resultado de un mes ya terminado");
    expect(rules).toContain("has_permission('kpis.bonus.manage')");
  });
  it("siembra los montos acordados por hostal", () => {
    expect(sql).toContain("('HOC',100000),('HOB',100000),('HU',60000)");
  });
});

describe("migración de reglas exigentes del bono", () => {
  it("guarda la primera emisión de cada cierre y la conserva al reemitir", () => {
    expect(rules).toContain("add column first_issued_at timestamptz");
    expect(rules).toContain("first_issued_at=coalesce(first_issued_at,now())");
    // La emisión sigue exigiendo permiso y la autorización de fechas anteriores.
    expect(rules).toContain("has_permission('lodging.closings.create')");
    expect(rules).toContain("lodging_closing_date_authorized");
  });
  it("renombra los pesos y fija las metas de venta promedio", () => {
    expect(rules).toContain("array['occupancy','adr','booking','survey','inspections','order']");
    expect(rules).toContain("('HOC',30000),('HOB',32000)");
  });
});
