import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261026181940_lodging_survey_receptionist.sql", "utf8");

describe("encuesta: recepcionista que atendió", () => {
  it("agrega la columna sin tocar las respuestas existentes y la guarda desde el formulario público", () => {
    expect(sql).toContain("add column receptionist text");
    expect(sql).toContain("p_payload->>'receptionist'");
    expect(sql).not.toMatch(/delete from|drop table|truncate|update public\.lodging_satisfaction_surveys/i);
  });
  it("sigue siendo solo para service_role", () => {
    expect(sql).toContain("revoke execute on function public.submit_lodging_survey(text,jsonb) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.submit_lodging_survey(text,jsonb) to service_role");
  });
});
