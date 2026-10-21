/** Precios por millón de tokens (USD) de la API de Claude, tarifa estándar. */
type ModelPrice = { input: number; output: number };

const PRICES: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

// Escritura de caché (5 min) = 1,25× la entrada; lectura = 0,1×.
const CACHE_WRITE_FACTOR = 1.25;
const CACHE_READ_FACTOR = 0.1;

export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export const supportedLuciaModels = Object.keys(PRICES);

/**
 * Costo en USD de una llamada. Un modelo desconocido se cobra como el más
 * caro de la tabla, para que el tope diario nunca quede por debajo del real.
 */
export function usageCostUsd(model: string, usage: ClaudeUsage): number {
  const price =
    PRICES[model] ??
    Object.values(PRICES).reduce((a, b) => (b.input > a.input ? b : a));
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cost =
    usage.input_tokens * price.input +
    cacheWrite * price.input * CACHE_WRITE_FACTOR +
    cacheRead * price.input * CACHE_READ_FACTOR +
    usage.output_tokens * price.output;
  return cost / 1_000_000;
}
