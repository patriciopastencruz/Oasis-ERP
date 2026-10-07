import { describe, expect, it } from "vitest";
import {
  summarizeSurveys,
  surveyAverage,
  surveySubmissionSchema,
  type SurveyRow,
} from "./survey";

const row = (over: Partial<SurveyRow> = {}): SurveyRow => ({
  cleanliness: 5,
  comfort: 4,
  staff: 5,
  value_for_money: 3,
  recommend: 9,
  ...over,
});

describe("encuesta de satisfacción", () => {
  it("sin respuestas no inventa promedios", () => {
    expect(summarizeSurveys([])).toMatchObject({
      count: 0,
      overall: null,
      nps: null,
      weakest: null,
    });
  });

  it("calcula promedios, NPS y la categoría más débil", () => {
    const result = summarizeSurveys([
      row(),
      row({ cleanliness: 3, value_for_money: 2, recommend: 5 }),
      row({ recommend: 10 }),
    ]);
    expect(result.count).toBe(3);
    expect(result.categories.find((c) => c.key === "cleanliness")?.average).toBe(4.3);
    expect(result.weakest?.key).toBe("value_for_money");
    // 2 promotores (9, 10), 1 detractor (5) sobre 3 → 33
    expect(result.nps).toBe(33);
  });

  it("no marca área débil si todo es 5", () => {
    const perfect = row({ cleanliness: 5, comfort: 5, staff: 5, value_for_money: 5 });
    expect(summarizeSurveys([perfect]).weakest).toBeNull();
    expect(surveyAverage(perfect)).toBe(5);
  });

  it("valida rangos del formulario", () => {
    const ok = {
      token: "a".repeat(32),
      cleanliness: "5",
      comfort: "4",
      staff: "5",
      value_for_money: "3",
      recommend: "10",
    };
    expect(surveySubmissionSchema.safeParse(ok).success).toBe(true);
    expect(surveySubmissionSchema.safeParse({ ...ok, cleanliness: "6" }).success).toBe(false);
    expect(surveySubmissionSchema.safeParse({ ...ok, recommend: "11" }).success).toBe(false);
    expect(surveySubmissionSchema.safeParse({ ...ok, token: "xyz" }).success).toBe(false);
  });
});
