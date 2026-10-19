import { z } from "zod";

export const SURVEY_CATEGORIES = [
  {
    key: "cleanliness",
    label: "Limpieza",
    question: "¿Qué tan limpia estaba tu habitación?",
  },
  {
    key: "comfort",
    label: "Comodidad",
    question: "¿Qué tan cómoda fue tu estadía? (cama, ruido, temperatura)",
  },
  {
    key: "staff",
    label: "Atención del personal",
    question: "¿Cómo fue la atención que recibiste?",
  },
  {
    key: "value_for_money",
    label: "Precio / calidad",
    question: "¿Sientes que lo que pagaste estuvo a la altura?",
  },
] as const;

export type SurveyCategoryKey = (typeof SURVEY_CATEGORIES)[number]["key"];

/** Recepcionistas que se nombran en la encuesta y en el cartel QR de cada hostal. */
export const SURVEY_RECEPTIONISTS: Record<string, string[]> = {
  HOC: ["Kathya", "Alicia"],
};

/** "Kathya o Alicia" (null si el hostal no nombra a su recepcionista). */
export function receptionistsLabel(unitCode: string | null | undefined) {
  const names = unitCode ? SURVEY_RECEPTIONISTS[unitCode] : undefined;
  return names?.length ? names.join(" o ") : null;
}

/** Texto de cada pregunta: la de atención nombra a la recepcionista del hostal cuando corresponde. */
export function surveyQuestion(category: (typeof SURVEY_CATEGORIES)[number], unitCode: string | null | undefined) {
  const names = receptionistsLabel(unitCode);
  if (category.key === "staff" && names) return `¿Cómo fue la atención que recibiste de ${names} en recepción?`;
  return category.question;
}

const score = z.coerce.number().int().min(1).max(5);

export const surveySubmissionSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  cleanliness: score,
  comfort: score,
  staff: score,
  value_for_money: score,
  recommend: score,
  comment: z.string().trim().max(1000).default(""),
  guest_name: z.string().trim().max(120).default(""),
  contact: z.string().trim().max(160).default(""),
  // Honeypot: un visitante real nunca completa este campo oculto.
  website: z.string().default(""),
});

export type SurveyRow = Record<SurveyCategoryKey, number> & {
  recommend: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function summarizeSurveys(rows: SurveyRow[]) {
  const count = rows.length;
  if (!count)
    return {
      count: 0,
      overall: null,
      recommendAverage: null,
      recommenders: 0,
      categories: SURVEY_CATEGORIES.map((c) => ({ ...c, average: null })),
      weakest: null,
    };
  const categories = SURVEY_CATEGORIES.map((category) => ({
    ...category,
    average: round1(
      rows.reduce((sum, row) => sum + Number(row[category.key]), 0) / count,
    ),
  }));
  const overall = round1(
    categories.reduce((sum, c) => sum + c.average, 0) / categories.length,
  );
  // Recomienda = puntaje 4 o 5 en "¿qué tan probable es que nos recomiendes?".
  const recommenders = rows.filter((row) => row.recommend >= 4).length;
  const sorted = [...categories].sort((a, b) => a.average - b.average);
  return {
    count,
    overall,
    recommendAverage: round1(
      rows.reduce((sum, row) => sum + Number(row.recommend), 0) / count,
    ),
    recommenders,
    categories,
    weakest: sorted[0].average < 5 ? sorted[0] : null,
  };
}

/** Promedio general (1 a 5) de una sola respuesta. */
export function surveyAverage(row: SurveyRow) {
  return round1(
    SURVEY_CATEGORIES.reduce((sum, c) => sum + Number(row[c.key]), 0) /
      SURVEY_CATEGORIES.length,
  );
}

/** Mensaje de WhatsApp para pedirle al huésped que responda la encuesta de su habitación. */
export function surveyMessage(unit: string, url: string, guestName?: string | null) {
  const hello = guestName && !/^reserva /i.test(guestName) ? `Hola ${guestName.split(" ")[0]}` : "Hola";
  return `${hello}, gracias por alojarte en ${unit}. Nos ayudaría mucho saber cómo fue tu estadía; responde esta breve encuesta (1 minuto): ${url}`;
}
