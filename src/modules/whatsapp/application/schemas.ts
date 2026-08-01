import { z } from "zod";
import { leadStatuses, productInterests } from "@/modules/whatsapp/domain/lead";

const uuid = z.string().uuid("Selecciona una opción válida.");

export const manualReplySchema = z.object({
  conversation_id: uuid,
  content: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío.")
    .max(1200, "El mensaje es demasiado largo."),
});

export const leadEditSchema = z.object({
  full_name: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((value) => value ?? ""),
  city: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((value) => value ?? ""),
  product_interest: z
    .enum(productInterests)
    .nullish()
    .transform((value) => value ?? null),
  bedrooms: z.coerce.number().int().min(0).max(20).nullish(),
  bathrooms: z.coerce.number().int().min(0).max(20).nullish(),
  surface_m2: z.coerce.number().min(0).max(10000).nullish(),
  budget_clp: z.coerce.number().min(0).max(9_999_999_999).nullish(),
  assigned_user_id: z.string().uuid().nullish(),
  status: z.enum(leadStatuses).nullish(),
  source_notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((value) => value ?? ""),
});
export type LeadEditInput = z.infer<typeof leadEditSchema>;

export const integrationSettingsSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((value) => value ?? ""),
  agent_name: z.string().trim().min(1, "El agente necesita un nombre.").max(80),
  fallback_message: z
    .string()
    .trim()
    .min(1, "Define un mensaje de respaldo.")
    .max(500),
  enabled: z.boolean(),
  automation_enabled: z.boolean(),
});
export type IntegrationSettingsInput = z.infer<typeof integrationSettingsSchema>;
