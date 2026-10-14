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

const CATEGORY_LABELS: Record<ReviewCategoryKey, string> = {
  cleanliness: "Limpieza",
  comfort: "Confort",
  facilities: "Instalaciones y servicios",
  location: "Ubicación",
  staff: "Personal",
  value: "Relación calidad-precio",
  wifi: "WiFi gratis",
};

const num = (value: string) => Number(value.replace(",", "."));

/**
 * Lee el texto copiado de la ficha pública de Booking (bloque "Comentarios de
 * los clientes" o la página completa) y saca puntaje, cantidad de comentarios
 * y puntaje por categoría. Devuelve null si no encuentra puntaje y cantidad.
 */
export function parseBookingReviewText(text: string) {
  const flat = text.replace(/\u00a0/g, " ");
  const summary =
    flat.match(/Puntuaci[óo]n:\s*[^\d\n]*?(\d+[.,]\d)\s*,?\s*basada en\s*([\d.]+)\s*comentarios?/i) ??
    flat.match(/(\d+[.,]\d)\s*\n\s*[^\n·]+·\s*([\d.]+)\s*comentarios?/i);
  if (!summary) return null;
  const score = num(summary[1]);
  const reviewCount = Number(summary[2].replace(/\./g, ""));
  if (!(score >= 0 && score <= 10) || !Number.isInteger(reviewCount)) return null;

  const categories: Partial<Record<ReviewCategoryKey, number>> = {};
  for (const [key, label] of Object.entries(CATEGORY_LABELS) as [ReviewCategoryKey, string][]) {
    // "Limpieza, 8,4, Puntuación media..." o "Limpieza\n8,4"
    const m = flat.match(new RegExp(`${label}\\s*,?\\s*(\\d+[.,]\\d)`, "i"));
    if (m) {
      const v = num(m[1]);
      if (v >= 0 && v <= 10) categories[key] = v;
    }
  }
  return { score, reviewCount, categories };
}
