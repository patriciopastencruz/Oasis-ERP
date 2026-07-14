import { z } from "zod";

const uuid = z.string().uuid("Selecciona una opción válida.");
const required = (label: string, min = 2) =>
  z.string().trim().min(min, `${label} es obligatorio.`);

export const expenseLineSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().min(1),
  expense_date: z.string().date("Ingresa una fecha válida."),
  merchant_name: required("El comercio"),
  document_type: z.enum([
    "receipt",
    "invoice",
    "voucher",
    "electronic_receipt",
    "other",
  ]),
  document_number: z.string().trim().max(100).optional().default(""),
  expense_category_id: uuid,
  cost_center_id: uuid,
  description: required("La descripción", 3).max(500),
  amount: z.coerce
    .number({ error: "Ingresa un monto válido." })
    .int("El monto debe ser en pesos completos.")
    .positive("El monto debe ser mayor que cero."),
  observation: z.string().trim().max(500).optional().default(""),
  sort_order: z.number().int().nonnegative(),
});

export const reportDraftSchema = z
  .object({
    id: z.string().uuid().optional(),
    business_unit_id: uuid,
    week_start: z.string().date(),
    week_end: z.string().date(),
    general_reason: required("El motivo general", 3).max(500),
    general_observations: z.string().trim().max(1000).optional().default(""),
    lines: z.array(expenseLineSchema).min(1, "Agrega al menos un gasto."),
  })
  .superRefine((report, context) => {
    const start = new Date(`${report.week_start}T12:00:00Z`);
    const end = new Date(`${report.week_end}T12:00:00Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (start.getUTCDay() !== 1 || days !== 6) {
      context.addIssue({
        code: "custom",
        path: ["week_start"],
        message: "La semana debe comenzar el lunes y terminar el domingo.",
      });
    }
    report.lines.forEach((line, index) => {
      if (
        line.expense_date < report.week_start ||
        line.expense_date > report.week_end
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "expense_date"],
          message:
            "La fecha del gasto debe pertenecer a la semana seleccionada.",
        });
      }
    });
  });

export type ReportDraft = z.infer<typeof reportDraftSchema>;

export type PettyCashActionResult = {
  success: boolean;
  message: string;
  id?: string;
  data?: unknown;
  fieldErrors?: Record<string, string[]>;
};

export const attachmentMetadataSchema = z.object({
  report_id: uuid,
  expense_line_id: uuid,
  original_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});

export const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;
export const allowedReceiptTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

export function validateReceipt(file: File) {
  if (!allowedReceiptTypes.includes(file.type))
    return "El comprobante debe ser PDF, JPG, JPEG o PNG.";
  if (file.size > MAX_RECEIPT_SIZE)
    return "El comprobante no puede superar 10 MB.";
  return null;
}
