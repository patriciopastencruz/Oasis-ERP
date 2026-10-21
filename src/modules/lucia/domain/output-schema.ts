import { z } from "zod";

export const luciaIntents = [
  "greeting",
  "faq",
  "availability",
  "price",
  "booking_intent",
  "complaint",
  "out_of_scope",
  "other",
] as const;
export type LuciaIntent = (typeof luciaIntents)[number];

export const luciaHostelCodes = ["HU", "HOC", "HOB"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

export const luciaProspectSchema = z.object({
  guest_name: optionalText(160),
  check_in: isoDate,
  check_out: isoDate,
  guests: z.number().int().min(1).max(60).nullish().catch(null).transform((v) => v ?? null),
  room_type: optionalText(120),
  preferences: optionalText(500),
  hostel_code: z.enum(luciaHostelCodes).nullish().catch(null).transform((v) => v ?? null),
  quoted_amount: z.number().min(0).nullish().catch(null).transform((v) => v ?? null),
  option_code: z.string().uuid().nullish().catch(null).transform((v) => v ?? null),
});
export type LuciaProspect = z.infer<typeof luciaProspectSchema>;

/**
 * Salida obligatoria de Lucía (forzada con la herramienta "responder"):
 * la respuesta sugerida y la ficha del prospecto en JSON.
 */
export const luciaOutputSchema = z.object({
  // A veces el modelo escribe el salto de línea como texto ("\\n"): se convierte
  // en un salto real para que WhatsApp lo muestre ordenado.
  reply: z
    .string()
    .transform((v) => v.replace(/(?:\\r)?\\n/g, "\n").replace(/\\t/g, " "))
    .pipe(z.string().trim().min(1).max(3000)),
  intent: z.enum(luciaIntents).catch("other"),
  answered_from_manual: z.boolean().catch(false),
  needs_human: z.boolean().catch(false),
  booking_request: z.boolean().catch(false),
  photos: z
    .object({ hostel_code: z.enum(luciaHostelCodes), room_type: z.string().trim().min(1).max(160) })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  reason: optionalText(300).catch(null),
  // Si la ficha viene incompleta o mal formada, se ignora sin perder la respuesta.
  prospect: luciaProspectSchema.catch(() => luciaProspectSchema.parse({})),
});
export type LuciaOutput = z.infer<typeof luciaOutputSchema>;

/** Esquema JSON de la herramienta "responder" que se envía a Claude. */
export const luciaRespondToolSchema = {
  type: "object" as const,
  properties: {
    reply: {
      type: "string",
      description:
        "Mensaje de WhatsApp para el cliente, breve (1 a 4 frases), en español.",
    },
    intent: { type: "string", enum: [...luciaIntents] },
    answered_from_manual: {
      type: "boolean",
      description:
        "true solo si toda la respuesta sale textualmente de los manuales o instrucciones.",
    },
    needs_human: {
      type: "boolean",
      description:
        "true si quiere reservar, reclama, pide una persona, pregunta algo fuera del manual o pide precio/disponibilidad que no tienes.",
    },
    booking_request: {
      type: "boolean",
      description:
        "true SOLO cuando el cliente eligió una opción concreta y quiere reservar, y en la ficha ya están nombre, llegada, salida, personas, hostal (hostel_code) y tipo de habitación. Activa la confirmación de recepción.",
    },
    photos: {
      type: ["object", "null"],
      description:
        "Solo si el cliente pide fotos y la habitación aparece en 'Fotos disponibles' del manual: hostal y tipo de habitación EXACTO de esa lista. El sistema envía hasta 3 fotos. null en otro caso.",
      properties: {
        hostel_code: { type: "string", enum: [...luciaHostelCodes] },
        room_type: { type: "string" },
      },
      required: ["hostel_code", "room_type"],
    },
    reason: {
      type: ["string", "null"],
      description: "Motivo breve si needs_human es true.",
    },
    prospect: {
      type: "object",
      description:
        "Datos del cliente mencionados en TODA la conversación. null si no se mencionaron.",
      properties: {
        guest_name: { type: ["string", "null"] },
        check_in: { type: ["string", "null"], description: "AAAA-MM-DD" },
        check_out: { type: ["string", "null"], description: "AAAA-MM-DD" },
        guests: { type: ["integer", "null"] },
        room_type: { type: ["string", "null"] },
        preferences: { type: ["string", "null"] },
        hostel_code: {
          type: ["string", "null"],
          enum: [...luciaHostelCodes, null],
          description:
            "Hostal elegida o la que mejor calza con lo pedido; null si aún no está claro.",
        },
        option_code: {
          type: ["string", "null"],
          description:
            "Código ('codigo') de la opción de consultar_disponibilidad que el cliente eligió explícitamente. null si aún no elige una opción concreta.",
        },
        quoted_amount: {
          type: ["number", "null"],
          description:
            "Monto total en CLP que TÚ informaste en esta respuesta, solo si salió de un dato entregado por el sistema. Nunca inventado.",
        },
      },
      required: [
        "guest_name",
        "check_in",
        "check_out",
        "guests",
        "room_type",
        "preferences",
        "hostel_code",
        "option_code",
        "quoted_amount",
      ],
    },
  },
  required: [
    "reply",
    "intent",
    "answered_from_manual",
    "needs_human",
    "booking_request",
    "photos",
    "reason",
    "prospect",
  ],
};
