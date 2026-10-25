const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isoWeekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Fechas que el cliente dijo en un texto («hoy», «mañana», «pasado mañana», «el viernes», «el 28»,
 * «28 de octubre», «28/10»), resueltas con el día de hoy. Sirve para comprobar que el asistente no
 * supone un día distinto al que se dijo.
 */
export function candidateDates(text: string, todayIso: string) {
  const t = plain(text);
  const found = new Set<string>();
  if (/\bhoy\b/.test(t)) found.add(todayIso);
  if (/\bpasado manana\b/.test(t)) found.add(addDays(todayIso, 2));
  else if (/\bmanana\b/.test(t)) found.add(addDays(todayIso, 1));
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      // Próxima vez que cae ese día (si es hoy, la de hoy y la de la semana siguiente son válidas).
      const diff = (wd - isoWeekday(todayIso) + 7) % 7;
      found.add(addDays(todayIso, diff));
      if (diff === 0) found.add(addDays(todayIso, 7));
    }
  }
  const [ty, tm] = [Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7))];
  const resolve = (day: number, month: number | null) => {
    if (day < 1 || day > 31) return;
    const months = month ? [month] : [tm, tm === 12 ? 1 : tm + 1];
    for (const m of months) {
      const year = m < tm ? ty + 1 : ty;
      const iso = `${year}-${pad(m)}-${pad(day)}`;
      if (!Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) && new Date(`${iso}T12:00:00Z`).getUTCDate() === day && iso >= todayIso) found.add(iso);
    }
  };
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MONTHS.join("|")})\\b`, "g"))) resolve(Number(m[1]), MONTHS.indexOf(m[2]) + 1);
  for (const m of t.matchAll(/\b(\d{1,2})[\/-](\d{1,2})\b/g)) resolve(Number(m[1]), Number(m[2]));
  for (const m of t.matchAll(/\bel\s+(\d{1,2})\b(?!\s*(?:de|\/|-)\s*\w)/g)) resolve(Number(m[1]), null);
  return found;
}

/** null si la fecha coincide con lo que dijo el cliente (o no se puede saber); si no, el motivo del rechazo. */
export function validateDeliveryDate(deliveryIso: string, customerText: string, todayIso: string) {
  const said = candidateDates(customerText, todayIso);
  if (!said.size) return null;
  if (said.has(deliveryIso)) return null;
  return "la fecha de entrega no coincide con lo que dijo el cliente; confirma con él el día exacto antes de continuar";
}
