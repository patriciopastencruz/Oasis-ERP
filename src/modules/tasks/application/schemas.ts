import { z } from "zod";

export const taskCardInputSchema = z.object({
  company_id: z.string().uuid(),
  title: z.string().trim().min(2, "Escribe un título").max(200),
  description: z.string().trim().max(2000).optional(),
  assignee_id: z.string().uuid().optional(),
  business_unit_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
});
export type TaskCardInput = z.infer<typeof taskCardInputSchema>;

export const attachmentMetadataSchema = z.object({
  task_card_id: z.string().uuid(),
  original_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});

export type TaskActionResult = {
  success: boolean;
  message: string;
  id?: string;
  data?: unknown;
};
