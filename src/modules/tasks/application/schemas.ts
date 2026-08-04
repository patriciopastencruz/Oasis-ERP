import { z } from "zod";

export const taskCardInputSchema = z.object({
  company_id: z.string().uuid(),
  title: z.string().trim().min(2, "Escribe un título").max(200),
  description: z.string().trim().max(2000).optional(),
  assignee_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
});
export type TaskCardInput = z.infer<typeof taskCardInputSchema>;

export type TaskActionResult = {
  success: boolean;
  message: string;
  id?: string;
};
