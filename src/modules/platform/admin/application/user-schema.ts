import { z } from "zod";
const uuid = z.string().uuid(),
  text = z.string().trim().min(1).max(160);
export const createUserSchema = z.object({
  first_name: text,
  last_name: text,
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional(),
  job_title: text,
  role_id: uuid,
  company_ids: z.array(uuid).min(1, "Debes asignar al menos una empresa."),
  unit_ids: z
    .array(uuid)
    .min(1, "Debes asignar al menos una unidad de negocio."),
});
export type UserActionResult = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
