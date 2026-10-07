import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261007160000_lodging_satisfaction_surveys.sql",
  "utf8",
);

describe("migración de encuestas de satisfacción", () => {
  it("protege la tabla con RLS y sin acceso para anon", () => {
    expect(sql).toContain(
      "alter table public.lodging_satisfaction_surveys enable row level security",
    );
    expect(sql).toContain(
      "revoke all on public.lodging_satisfaction_surveys from public,anon,authenticated",
    );
    expect(sql).not.toContain("using(true)");
    expect(sql).toContain("has_permission('lodging.surveys.view')");
  });

  it("solo service_role puede enviar respuestas", () => {
    expect(sql).toContain(
      "revoke execute on function public.submit_lodging_survey(text,jsonb) from public,anon,authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.submit_lodging_survey(text,jsonb) to service_role",
    );
  });

  it("valida puntajes y limita la frecuencia de respuestas", () => {
    expect(sql).toContain("Puntaje invalido");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("check(recommend between 0 and 10)");
  });

  it("la migración posterior pasa la recomendación a escala 1-5", () => {
    const scale = readFileSync(
      "supabase/migrations/20261007170000_lodging_survey_recommend_scale.sql",
      "utf8",
    );
    expect(scale).toContain("check(recommend between 1 and 5)");
    expect(scale).toContain("coalesce(v_rec,0) not between 1 and 5");
  });

  it("cada habitación tiene su token único de encuesta", () => {
    expect(sql).toContain("lodging_rooms_survey_token_key");
  });
});
