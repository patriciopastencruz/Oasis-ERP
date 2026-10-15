import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261016120000_lodging_reception_bonus.sql", "utf8");

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
  });
  it("siembra los montos acordados por hostal", () => {
    expect(sql).toContain("('HOC',100000),('HOB',100000),('HU',60000)");
  });
});
