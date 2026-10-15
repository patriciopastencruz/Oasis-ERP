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

const wait = readFileSync("supabase/migrations/20261016140000_lodging_bonus_inspection_wait_70.sql", "utf8");

const pool = readFileSync("supabase/migrations/20261016150000_lodging_bonus_pool_amounts.sql", "utf8");

const weights = readFileSync("supabase/migrations/20261016180000_lodging_bonus_weights_survey.sql", "utf8");

describe("migración de pesos del bono", () => {
  it("reparte 20/20/25/10/10/15 y fija la meta de la encuesta en 4", () => {
    expect(weights).toContain('"occupancy":20,"adr":20,"booking":25,"survey":10,"inspections":10,"order":15');
    expect(weights).toContain("survey_goal=4.00");
  });
});

describe("migración de montos del bono", () => {
  it("fija 150.000 en Centro y Cobija y 100.000 en Uruguay", () => {
    expect(pool).toContain("('HOC',150000),('HOB',150000),('HU',100000)");
  });
});

describe("migración de reglas exigentes del bono", () => {
  it("fija en 70 minutos el máximo hasta la inspección", () => {
    expect(wait).toContain("inspection_max_wait_minutes set default 70");
    expect(wait).toContain("set inspection_max_wait_minutes=70");
  });
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
