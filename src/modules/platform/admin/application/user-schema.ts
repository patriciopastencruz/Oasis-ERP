import { z } from "zod";
const uuid = z.string().uuid(),
  text = z.string().trim().min(1).max(160);
export const userAssignmentSchema = z.object({
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
export const createUserSchema = userAssignmentSchema
  .extend({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(72, "La contraseña no puede superar 72 caracteres."),
    password_confirmation: z.string(),
  })
  .refine((value) => value.password === value.password_confirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["password_confirmation"],
  });
export const updateUserSchema = userAssignmentSchema.extend({ id: uuid });
export type UserActionResult = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
