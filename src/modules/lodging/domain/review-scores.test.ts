import { describe, expect, it } from "vitest";
import {
  parseBookingReviewText,
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

describe("lectura del texto de Booking", () => {
  const bloque = `Comentarios de los clientes
Ver disponibilidad
7,0
Bien · 324 comentarios
Leer todos los comentarios
Categorías:
Limpieza, 7,6, Puntuación media sobre 10
Limpieza
7,6
Confort, 7,4, Puntuación media sobre 10
Instalaciones y servicios, 7,2, Puntuación media sobre 10
Ubicación, 7,0, Puntuación media sobre 10
Personal, 8,1, Puntuación media sobre 10
Relación calidad-precio, 7,7, Puntuación media sobre 10`;

  it("saca puntaje, comentarios y categorías del bloque copiado", () => {
    expect(parseBookingReviewText(bloque)).toEqual({
      score: 7,
      reviewCount: 324,
      categories: {
        cleanliness: 7.6,
        comfort: 7.4,
        facilities: 7.2,
        location: 7,
        staff: 8.1,
        value: 7.7,
      },
    });
  });

  it("entiende la línea de resumen y miles con punto", () => {
    expect(
      parseBookingReviewText("Puntuación: Agradable 6.9, basada en 1.465 comentarios WiFi gratis, 7,6"),
    ).toEqual({ score: 6.9, reviewCount: 1465, categories: { wifi: 7.6 } });
  });

  it("devuelve null si no hay puntaje reconocible", () => {
    expect(parseBookingReviewText("hola, nada que ver")).toBeNull();
  });
});
