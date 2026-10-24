/**
 * ¿El cliente dijo cuál opción quiere? Se usa antes de pedir la reserva: si el
 * último mensaje de Lucía mostró varias opciones (líneas «• …») y el cliente
 * responde sin identificar una sola («la quiero», «esa», «ok»), no se elige
 * por él: hay que preguntarle.
 */

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "con", "en", "por", "para", "un", "una", "a", "al",
  "habitacion", "pieza", "noche", "noches", "persona", "personas", "precio", "total",
]);
const ORDINALS: [RegExp, number | "last"][] = [
  [/\b(primera|primer|1ra|1era)\b/, 0],
  [/\b(segunda|segundo|2da)\b/, 1],
  [/\b(tercera|tercer|3ra)\b/, 2],
  [/\b(cuarta|cuarto|4ta)\b/, 3],
  [/\b(quinta|quinto|5ta)\b/, 4],
  [/\bultima\b/, "last"],
];

const plain = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (text: string) =>
  plain(text).replace(/(\d)\.(\d{3})/g, "$1$2").split(/[^a-z0-9²]+/).filter((w) => w && !STOPWORDS.has(w));

/** Opciones del mensaje: cada línea «• …» con las palabras de su hostal. */
export function listedOptions(message: string): string[][] {
  const options: string[][] = [];
  let hostel: string[] = [];
  for (const line of message.split("\n")) {
    const trimmed = line.trim();
    if (/^\*[^*]+\*/.test(trimmed)) hostel = words(trimmed.replace(/\*/g, ""));
    else if (trimmed.startsWith("•")) {
      const [label, ...rest] = trimmed.slice(1).split(/:\s*\$/);
      const price = rest.join(" ").match(/^[\d.]+/)?.[0]?.replace(/\./g, "");
      options.push([...words(label), ...hostel, ...(price ? [price, price.slice(0, -3)] : [])]);
    }
  }
  return options;
}

/**
 * true cuando hay 2 o más opciones a la vista y el mensaje del cliente no
 * apunta a exactamente una (por palabras propias de esa opción, su precio, su
 * hostal o su posición: «la primera», «la última»).
 */
export function choiceIsAmbiguous(lastAssistantMessage: string, customerMessage: string): boolean {
  const options = listedOptions(lastAssistantMessage);
  if (options.length < 2) return false;
  const said = plain(customerMessage);
  for (const [pattern, index] of ORDINALS) {
    if (pattern.test(said)) return (index === "last" ? options.length - 1 : index) >= options.length;
  }
  const saidWords = new Set(words(customerMessage));
  const matches = options.filter((option, i) =>
    option.some(
      (w) => saidWords.has(w) && !options.some((other, j) => j !== i && other.includes(w)),
    ),
  );
  return matches.length !== 1;
}
