import { z } from "zod";

export const requestTypes = [
  "supplier_payment",
  "reimbursement",
  "advance",
  "petty_cash",
  "other",
] as const;
export const priorities = ["normal", "urgent", "scheduled"] as const;
export const allowedAttachmentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 4;

const optionalRequestId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.uuid("La solicitud no es válida.").optional(),
);

export const paymentRequestSchema = z
  .object({
    id: optionalRequestId,
    company_id: z.uuid("Selecciona una empresa válida."),
    business_unit_id: z.uuid("Selecciona una unidad de negocio."),
    request_type: z.enum(requestTypes, "Selecciona un tipo de solicitud."),
    supplier_id: z.uuid("Selecciona un proveedor."),
    amount: z.coerce
      .number("Ingresa un monto válido.")
      .int("El monto debe ser un número entero.")
      .positive("El monto debe ser mayor que cero."),
    expense_category_id: z.uuid("Selecciona una categoría de gasto."),
    cost_center_id: z.uuid("Selecciona un centro de costo."),
    priority: z.enum(priorities, "Selecciona una prioridad."),
    requested_payment_date: z.string().optional(),
    description: z
      .string()
      .trim()
      .min(5, "La descripción debe tener al menos 5 caracteres.")
      .max(2000, "La descripción no puede superar 2.000 caracteres."),
    notes: z
      .string()
      .trim()
      .max(2000, "Las observaciones no pueden superar 2.000 caracteres.")
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.priority === "scheduled" && !value.requested_payment_date) {
      context.addIssue({
        code: "custom",
        path: ["requested_payment_date"],
        message: "La fecha es obligatoria para una solicitud programada.",
      });
    }
  });

export type ActionResult = {
  success: boolean;
  message?: string;
  id?: string;
  fieldErrors?: Record<string, string[]>;
  data?: unknown;
};
export function validateAttachment(file: File) {
  if (!allowedAttachmentTypes.includes(file.type))
    return "Solo se permiten archivos PDF, JPG, JPEG o PNG";
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE)
    return "Cada archivo debe pesar entre 1 byte y 10 MB";
  return null;
}
