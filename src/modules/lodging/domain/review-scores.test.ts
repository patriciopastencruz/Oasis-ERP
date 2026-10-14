import { describe, expect, it } from "vitest";
import {
  parseScoreInput,
  summarizeReviewHistory,
  type ReviewScoreRow,
} from "./review-scores";

const row = (over: Partial<ReviewScoreRow>): ReviewScoreRow => ({
  recorded_on: "2026-10-14",
  score: 7,
  review_count: 100,
  categories: { cleanliness: 8, wifi: 5 },
  ...over,
});

describe("seguimiento de reseñas", () => {
  it("lee decimales con coma o punto", () => {
    expect(parseScoreInput("7,3")).toBe(7.3);
    expect(parseScoreInput(" 8.4 ")).toBe(8.4);
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("abc")).toBeNull();
  });

  it("sin registros no inventa variaciones", () => {
    expect(summarizeReviewHistory([])).toMatchObject({
      latest: null,
      scoreDelta: null,
      weakest: null,
    });
  });

  it("con un solo registro no hay variación", () => {
    const result = summarizeReviewHistory([row({})]);
    expect(result.scoreDelta).toBeNull();
    expect(result.weakest).toMatchObject({ key: "wifi", value: 5 });
  });

  it("compara el último registro con el anterior sin importar el orden", () => {
    const result = summarizeReviewHistory([
      row({ recorded_on: "2026-10-21", score: 7.4, review_count: 112, categories: { cleanliness: 8.1, wifi: 5.5 } }),
      row({ recorded_on: "2026-10-14", score: 7.0, review_count: 100 }),
    ]);
    expect(result.latest?.recorded_on).toBe("2026-10-21");
    expect(result.scoreDelta).toBe(0.4);
    expect(result.countDelta).toBe(12);
    expect(result.categoryDeltas).toEqual({ cleanliness: 0.1, wifi: 0.5 });
  });
});
