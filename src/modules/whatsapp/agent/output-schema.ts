import { z } from "zod";

export const whatsappAgentIntents = [
  "faq",
  "qualification",
  "quote_request",
  "human_handoff",
  "unknown",
] as const;
export type WhatsAppAgentIntent = (typeof whatsappAgentIntents)[number];

const nullableTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .nullish()
    .transform((value) => value ?? null);

export const whatsappLeadUpdatesSchema = z.object({
  full_name: nullableTrimmedString(160),
  city: nullableTrimmedString(120),
  product_interest: z
    .enum(["casa", "oficina", "bano", "otro"])
    .nullish()
    .transform((value) => value ?? null),
  bedrooms: z.number().int().min(0).max(20).nullish().transform((v) => v ?? null),
  bathrooms: z.number().int().min(0).max(20).nullish().transform((v) => v ?? null),
  surface_m2: z
    .number()
    .min(0)
    .max(10000)
    .nullish()
    .transform((v) => v ?? null),
  budget_clp: z
    .number()
    .min(0)
    .max(9_999_999_999)
    .nullish()
    .transform((v) => v ?? null),
});
export type WhatsAppLeadUpdates = z.infer<typeof whatsappLeadUpdatesSchema>;

/**
 * Salida estructurada obligatoria del agente. El modelo solo puede
 * devolver esta forma (forzada por tool-use en anthropic-agent.ts) —
 * nunca texto libre ni acciones fuera de este schema.
 */
export const whatsappAgentOutputSchema = z.object({
  reply: z.string().trim().min(1).max(1200),
  intent: z.enum(whatsappAgentIntents),
  leadUpdates: whatsappLeadUpdatesSchema,
  requiresHuman: z.boolean(),
  reason: nullableTrimmedString(300),
});
export type WhatsAppAgentOutput = z.infer<typeof whatsappAgentOutputSchema>;
