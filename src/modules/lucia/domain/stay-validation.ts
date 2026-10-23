export type StayDates = {
  check_in: string;
  check_out: string;
};

const DAY_MS = 86_400_000;
const NUMBER_WORDS: Record<string, number> = {
  una: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function lastExplicitNightCount(text: string) {
  const matches = [...text.matchAll(/\b(\d{1,2}|una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+noches?\b/g)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] ?? null;
}

function lastDepartureWeekday(text: string) {
  const matches = [
    ...text.matchAll(/(?:hasta|salida|salgo|salimos|me voy|nos vamos|se va|se van|al)\s+(?:el\s+|el dia\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/g),
  ];
  return matches.at(-1)?.[1] ?? null;
}

/**
 * Evita consultar y cotizar una estadía si la interpretación de fechas
 * contradice datos explícitos del cliente (cantidad de noches, "hoy" o día
 * de salida). Devuelve una instrucción segura para que Lucía corrija la fecha.
 */
export function validateStayAgainstCustomerText(
  stay: StayDates,
  customerText: string,
  todayIso: string,
): string | null {
  const checkIn = parseIsoDate(stay.check_in);
  const checkOut = parseIsoDate(stay.check_out);
  if (!checkIn || !checkOut) return null;

  const text = normalize(customerText);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
  const explicitNights = lastExplicitNightCount(text);
  if (explicitNights !== null && nights !== explicitNights) {
    return `Las fechas calculadas equivalen a ${nights} noche${nights === 1 ? "" : "s"}, pero el cliente indicó ${explicitNights}. Corrige la salida antes de consultar; si no hay una única interpretación posible, pregunta solo la fecha de salida.`;
  }

  if (/\b(?:llego|llegamos|llega|entrada)\s+hoy\b/.test(text) && stay.check_in !== todayIso) {
    return `El cliente indicó que llega hoy (${todayIso}), pero la llegada calculada es ${stay.check_in}. Corrígela antes de consultar.`;
  }

  const departureWeekday = lastDepartureWeekday(text);
  if (departureWeekday && checkOut.getUTCDay() !== WEEKDAYS[departureWeekday]) {
    return `El cliente indicó salida el ${departureWeekday}, pero ${stay.check_out} cae otro día de la semana. Corrige la fecha antes de consultar; si sigue siendo ambiguo, pregunta solo la fecha de salida.`;
  }

  return null;
}
