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

const goals = readFileSync("supabase/migrations/20261016190000_lodging_bonus_adr_goals.sql", "utf8");

const goals2 = readFileSync("supabase/migrations/20261016200000_lodging_bonus_adr_goals_2.sql", "utf8");

describe("migración de metas de venta promedio", () => {
  it("ajusta Centro a 28.000 y Cobija a 31.000", () => {
    expect(goals2).toContain("('HOC',28000),('HOB',31000)");
  });
  it("fija 29.000 Centro, 32.000 Cobija y 27.000 Uruguay", () => {
    expect(goals).toContain("('HOC',29000),('HOB',32000),('HU',27000)");
  });
});

describe("migración de pesos del bono", () => {
  it("reparte 20/20/25/10/10/15 y fija la meta de la encuesta en 4", () => {
    expect(weights).toContain('"occupancy":20,"adr":20,"booking":25,"survey":10,"inspections":10,"order":15');
    expect(weights).toContain("survey_goal=4.00");
  });
});

const removeSupervisor = readFileSync("supabase/migrations/20261017140000_lodging_remove_supervisor_bonus.sql", "utf8");

describe("retiro del bono del supervisor", () => {
  it("quita las columnas del supervisor y conserva el permiso de gestión al guardar", () => {
    expect(removeSupervisor).toContain("drop column supervisor_pool_amount");
    expect(removeSupervisor).toContain("drop column supervisor_points,drop column supervisor_amount");
    expect(removeSupervisor.match(/has_permission\('kpis\.bonus\.manage'\)/g)?.length).toBe(2);
    expect(removeSupervisor).not.toContain("supervisor_pool_amount::");
  });
});

const support = readFileSync("supabase/migrations/20261017150000_lodging_support_bonus.sql", "utf8");

describe("migración del bono de apoyo transversal", () => {
  it("protege las tablas con RLS, sin escritura directa y con auditoría", () => {
    expect(support).toContain("alter table public.lodging_support_bonus_config enable row level security");
    expect(support).toContain("alter table public.lodging_support_bonus_results enable row level security");
    expect(support).toContain("revoke all on public.lodging_support_bonus_config,public.lodging_support_bonus_results from public,anon,authenticated");
    expect(support).toContain("audit_row_change");
    expect(support).not.toContain("using(true)");
  });
  it("configurar y guardar exigen el permiso de gestión y solo se guardan meses terminados", () => {
    expect(support.match(/has_permission\('kpis\.bonus\.manage'\)/g)?.length).toBe(3);
    expect(support).toContain("Solo se guarda el resultado de un mes ya terminado");
  });
  it("parte con 100.000 y las metas de una reserva por noche en Centro y Uruguay y tres por semana en Cobija", () => {
    expect(support).toContain('{"HOC":{"per_day":1},"HU":{"per_day":1},"HOB":{"per_week":3}}');
    expect(support).toContain("'Alicia' and p.last_name ilike 'Pedraza'");
    expect(support).toContain(",100000");
  });
});

const firstIssuer = readFileSync("supabase/migrations/20261017160000_lodging_closing_first_issuer.sql", "utf8");

describe("migración de quién emite primero el cierre", () => {
  it("guarda y conserva al primer emisor, y mantiene la autorización de fechas anteriores", () => {
    expect(firstIssuer).toContain("add column first_issued_by uuid references public.profiles(id)");
    expect(firstIssuer).toContain("first_issued_by=coalesce(first_issued_by,auth.uid())");
    expect(firstIssuer).toContain("has_permission('lodging.closings.create')");
    expect(firstIssuer).toContain("lodging_closing_date_authorized");
  });
});

const monthlyGoals = readFileSync("supabase/migrations/20261017170000_lodging_support_monthly_goals.sql", "utf8");

describe("migración de metas mensuales del bono de apoyo", () => {
  it("fija 10 reservas en Centro, 10 en Uruguay y 6 en Cobija por mes y exige el permiso de gestión", () => {
    expect(monthlyGoals).toContain('{"HOC":{"per_month":10},"HU":{"per_month":10},"HOB":{"per_month":6}}');
    expect(monthlyGoals).toContain("has_permission('kpis.bonus.manage')");
  });
});

const goals15 = readFileSync("supabase/migrations/20261017180000_lodging_support_goals_15.sql", "utf8");

describe("migración de metas de 15 reservas del bono de apoyo", () => {
  it("sube Centro y Uruguay a 15 por mes y mantiene Cobija en 6", () => {
    expect(goals15).toContain('{"HOC":{"per_month":15},"HU":{"per_month":15},"HOB":{"per_month":6}}');
  });
});

const goalsCobija15 = readFileSync("supabase/migrations/20261017190000_lodging_support_goals_cobija_15.sql", "utf8");

describe("migración de metas de 15 reservas en los tres hostales", () => {
  it("fija 15 reservas de noche por mes en Centro, Uruguay y Cobija", () => {
    expect(goalsCobija15).toContain('{"HOC":{"per_month":15},"HU":{"per_month":15},"HOB":{"per_month":15}}');
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
