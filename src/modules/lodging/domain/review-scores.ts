export const REVIEW_CATEGORIES = [
  { key: "cleanliness", label: "Limpieza" },
  { key: "comfort", label: "Confort" },
  { key: "facilities", label: "Instalaciones y servicios" },
  { key: "location", label: "Ubicación" },
  { key: "staff", label: "Personal" },
  { key: "value", label: "Calidad-precio" },
  { key: "wifi", label: "WiFi gratis" },
] as const;

export type ReviewCategoryKey = (typeof REVIEW_CATEGORIES)[number]["key"];

export type ReviewScoreRow = {
  recorded_on: string;
  score: number;
  review_count: number;
  categories: Partial<Record<ReviewCategoryKey, number>>;
};

/** Acepta "7,3" o "7.3". Devuelve null si está vacío o no es un número. */
export function parseScoreInput(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Evolución de un hostal. `rows` en cualquier orden. Compara el último
 * registro con el anterior y marca la categoría más baja del último.
 */
export function summarizeReviewHistory(rows: ReviewScoreRow[]) {
  const sorted = [...rows].sort((a, b) =>
    a.recorded_on.localeCompare(b.recorded_on),
  );
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length > 1 ? sorted.at(-2)! : null;
  if (!latest)
    return {
      latest: null,
      previous: null,
      scoreDelta: null,
      countDelta: null,
      categoryDeltas: {} as Partial<Record<ReviewCategoryKey, number>>,
      weakest: null,
    };
  const categoryDeltas: Partial<Record<ReviewCategoryKey, number>> = {};
  if (previous)
    for (const { key } of REVIEW_CATEGORIES) {
      const now = latest.categories[key];
      const before = previous.categories[key];
      if (now != null && before != null) categoryDeltas[key] = round1(now - before);
    }
  const scored = REVIEW_CATEGORIES.flatMap(({ key, label }) =>
    latest.categories[key] != null
      ? [{ key, label, value: latest.categories[key]! }]
      : [],
  ).sort((a, b) => a.value - b.value);
  return {
    latest,
    previous,
    scoreDelta: previous ? round1(latest.score - previous.score) : null,
    countDelta: previous ? latest.review_count - previous.review_count : null,
    categoryDeltas,
    weakest: scored[0] ?? null,
  };
}
