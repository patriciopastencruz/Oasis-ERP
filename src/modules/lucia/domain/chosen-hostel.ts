/**
 * Si el cliente ya eligió hostal o tipo de habitación («me quedo con el mini
 * depto»), al volver a consultar se le muestran solo las opciones de esa
 * hostal, no la lista completa de las tres.
 */

const GENERIC = new Set([
  "hostal", "hospedaje", "oasis", "de", "del", "la", "el", "los", "las", "y", "a", "al", "en", "con", "para", "por",
  "sector", "numero", "cercano", "parcela", "calama", "marzo", "habitacion", "habitaciones", "pieza", "bano", "banos",
  "compartido", "compartida", "privado", "cocina", "cama", "camas", "matrimonial", "plaza", "plazas", "noche", "tv",
]);

const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));

// «deptos» / «modulares»: se compara sin la s final.
const stem = (w: string) => w.replace(/(es|s)$/, "");

/** Palabras propias de cada bloque de hostal: su nombre, ubicación y tipos de habitación. */
function blockKeywords(block: string) {
  const [title, ...lines] = block.split("\n");
  const types = lines.filter((l) => l.startsWith("•")).map((l) => l.slice(1).split(":")[0]);
  return new Set([title, ...types].flatMap(words).map(stem));
}

/**
 * Devuelve el resumen solo con la hostal elegida, o null si no hay una sola
 * elección clara. `customerMessages` va del más antiguo al más reciente; se
 * mira el último mensaje del cliente que nombra alguna hostal u opción.
 */
export function focusOnChosenHostel(summary: string, customerMessages: string[]): string | null {
  const blocks = summary.split("\n\n");
  const hostelBlocks = blocks.filter((b) => b.startsWith("*"));
  if (hostelBlocks.length < 2) return null;
  const keywords = hostelBlocks.map(blockKeywords);
  for (const message of [...customerMessages].reverse()) {
    const said = new Set(words(message).map(stem));
    const matches = hostelBlocks.filter((_, i) => [...keywords[i]].some((k) => said.has(k)));
    if (matches.length === 1) {
      return `${matches[0]}\n\nSi quieres ver las opciones de las otras hostales, dime y te las muestro.`;
    }
    if (matches.length > 1) return null;
  }
  return null;
}
