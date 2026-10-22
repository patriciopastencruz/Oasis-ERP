export type WalkInStatus = "on_the_way" | "at_entrance";

const plain = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const AT_ENTRANCE = [
  /\bestoy\s+(?:aqui\s+)?afuera\b/,
  /\b(?:ya\s+)?(?:llegue|llegamos)\b/,
  /\bestoy\s+en\s+(?:la\s+)?(?:entrada|puerta)\b/,
  /\b(?:nadie|aun no|todavia no)\s+(?:me\s+)?(?:abre|abrio|viene|sale|atiende)\b/,
  /\b(?:puede|puedes|podria)\s+avisar\b[^.\n]{0,45}\b(?:entrar|abran|abrir)\b/,
  /\b(?:toque|toco)\s+(?:el\s+)?timbre\b/,
];

const ON_THE_WAY = [
  /\b(?:voy|vamos)\s+(?:directo\s+)?(?:para|pa|hacia)\s+(?:alla|el\s+hostal|la\s+hostal)\b/,
  /\b(?:voy|vamos)\s+en\s+camino\b/,
  /\b(?:pasare|pasamos)\b[^.\n]{0,45}\b(?:altiro|ahora|enseguida|hoy)\b/,
  /\b(?:ire|iremos|me\s+dirijo)\b[^.\n]{0,45}\b(?:ahora|altiro|enseguida|directo|para\s+alla)\b/,
];

/** Detecta solo visitas inmediatas; las posibilidades vagas no alertan al equipo. */
export function detectWalkInStatus(text: string): WalkInStatus | null {
  const normalized = plain(text);
  if (AT_ENTRANCE.some((pattern) => pattern.test(normalized))) return "at_entrance";
  if (/\b(?:tal vez|quizas|puede que)\b/.test(normalized)) return null;
  if (ON_THE_WAY.some((pattern) => pattern.test(normalized))) return "on_the_way";
  return null;
}
