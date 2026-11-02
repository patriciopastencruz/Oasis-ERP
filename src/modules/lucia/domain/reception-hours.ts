/**
 * Horario de recepción de cada hostal y la regla de la dirección: fuera de
 * ese horario Lucía no entrega la dirección exacta a quien no tiene una
 * reserva pagada, porque nadie puede asegurar la disponibilidad ni recibirlo.
 * La llegada fuera de horario se coordina antes con recepción.
 */

export type ReceptionHours = {
  reception_open_time: string;
  reception_close_time: string;
  reception_close_time_weekend: string | null;
};

export type ClosedHostel = { code: string; name: string; address: string | null; opens: string; closes: string };

const hhmm = (time: string) => time.slice(0, 5);

/** Hora y día de la semana en Chile. */
function santiagoClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { time: `${get("hour")}:${get("minute")}`, weekend: ["Sat", "Sun"].includes(get("weekday")) };
}

/** ¿Está abierta la recepción ahora? Con el horario de apertura y cierre de hoy. */
export function receptionState(hours: ReceptionHours, now = new Date()) {
  const { time, weekend } = santiagoClock(now);
  const opens = hhmm(hours.reception_open_time);
  const closes = hhmm(weekend ? hours.reception_close_time_weekend ?? hours.reception_close_time : hours.reception_close_time);
  return { open: time >= opens && time < closes, opens, closes };
}

/** «Cobija 3207» desde la línea «- Dirección: Cobija 3207, Calama…» del manual de la hostal. */
export function hostelAddress(manual: string) {
  const line = manual.match(/direcci[oó]n\s*:\s*([^\n]+)/i)?.[1] ?? "";
  const address = line.split(/[,(.]/)[0].trim();
  return /\d/.test(address) ? address : null;
}

const plain = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** ¿El mensaje trae esa dirección (calle y número, aunque lleve «#» o «N°»)? */
export function mentionsAddress(message: string, address: string) {
  const match = plain(address).match(/^(.*\D)\s*(\d+)$/);
  if (!match) return false;
  const street = match[1].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`${street}\\s*(?:#|n[°º.]?|numero)?\\s*${match[2]}\\b`).test(plain(message));
}

/** Respuesta cuando piden la dirección (o quieren llegar) con la recepción cerrada. */
export function afterHoursArrivalReply(hostels: ClosedHostel[]) {
  const hours = hostels
    .map((h) => (hostels.length === 1 ? `${h.name} ya cerró por hoy (atiende de ${h.opens} a ${h.closes})` : `${h.name}: de ${h.opens} a ${h.closes}`))
    .join("\n");
  return hostels.length === 1
    ? `La recepción de ${hours}. Para llegar fuera de ese horario hay que coordinarlo antes con recepción: sin esa confirmación no podemos asegurar la disponibilidad ni tu ingreso 🙏 Ya le avisé al equipo; la dirección exacta te la compartimos cuando confirmen tu llegada.`
    : `En este momento nuestras recepciones están cerradas. Horarios de atención:\n${hours}\n\nPara llegar fuera de horario hay que coordinarlo antes con recepción: sin esa confirmación no podemos asegurar la disponibilidad ni tu ingreso 🙏 Ya le avisé al equipo; la dirección exacta te la compartimos cuando confirmen tu llegada.`;
}
