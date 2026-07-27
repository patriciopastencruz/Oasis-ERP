import { z } from "zod";
import {
  projectDocumentTypes,
  projectExpenseCategories,
  projectExpenseDocumentTypes,
  projectMemberRoles,
} from "@/modules/sales/projects/domain/project";

const uuid = z.string().uuid("Selecciona una opción válida.");
const required = (label: string, min = 2) =>
  z.string().trim().min(min, `${label} es obligatorio.`);
const optionalText = (max = 500) => z.string().trim().max(max).optional();
const optionalDate = () =>
  z.string().date("Ingresa una fecha válida.").optional().or(z.literal(""));
const money = (label: string) =>
  z.coerce
    .number({ error: `Ingresa ${label} válido.` })
    .nonnegative(`${label} no puede ser negativo.`);

export const createProjectSchema = z
  .object({
    name: required("El nombre del proyecto", 3).max(200),
    description: optionalText(2000),
    client_company: required("El cliente"),
    client_rut: optionalText(20),
    client_contact: optionalText(200),
    client_email: z
      .string()
      .trim()
      .email("Ingresa un correo válido.")
      .optional()
      .or(z.literal("")),
    client_place: optionalText(300),
    execution_address: optionalText(300),
    responsible_id: uuid,
    net_income: money("el ingreso neto"),
    estimated_start_date: optionalDate(),
    estimated_end_date: optionalDate(),
    notes: optionalText(2000),
  })
  .superRefine((data, context) => {
    if (
      data.estimated_start_date &&
      data.estimated_end_date &&
      data.estimated_end_date < data.estimated_start_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["estimated_end_date"],
        message: "La fecha de término no puede ser anterior a la de inicio.",
      });
    }
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const convertQuotationSchema = z
  .object({
    quotation_id: uuid,
    name: optionalText(200),
    description: optionalText(2000),
    execution_address: optionalText(300),
    responsible_id: uuid,
    estimated_start_date: optionalDate(),
    estimated_end_date: optionalDate(),
    notes: optionalText(2000),
  })
  .superRefine((data, context) => {
    if (
      data.estimated_start_date &&
      data.estimated_end_date &&
      data.estimated_end_date < data.estimated_start_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["estimated_end_date"],
        message: "La fecha de término no puede ser anterior a la de inicio.",
      });
    }
  });
export type ConvertQuotationInput = z.infer<typeof convertQuotationSchema>;

export const updateProjectSchema = z.object({
  name: required("El nombre del proyecto", 3).max(200),
  description: optionalText(2000),
  client_company: optionalText(300),
  client_rut: optionalText(20),
  client_contact: optionalText(200),
  client_email: z
    .string()
    .trim()
    .email("Ingresa un correo válido.")
    .optional()
    .or(z.literal("")),
  client_place: optionalText(300),
  execution_address: optionalText(300),
  net_income: money("el ingreso neto"),
  estimated_start_date: optionalDate(),
  actual_start_date: optionalDate(),
  estimated_end_date: optionalDate(),
  notes: optionalText(2000),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectMemberSchema = z
  .object({
    member_type: z.enum(["user", "external"]),
    profile_id: z.string().uuid().optional().or(z.literal("")),
    external_name: optionalText(200),
    role: z.enum(projectMemberRoles),
    note: optionalText(500),
  })
  .superRefine((data, context) => {
    if (data.member_type === "user" && !data.profile_id) {
      context.addIssue({
        code: "custom",
        path: ["profile_id"],
        message: "Debes seleccionar un usuario.",
      });
    }
    if (data.member_type === "external" && !data.external_name?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["external_name"],
        message: "Debes indicar el nombre del colaborador externo.",
      });
    }
  });
export type ProjectMemberInput = z.infer<typeof projectMemberSchema>;

export const projectExpenseSchema = z.object({
  project_id: uuid,
  expense_date: z.string().date("Ingresa una fecha válida."),
  category: z.enum(projectExpenseCategories),
  description: required("La descripción", 3).max(500),
  supplier_name: optionalText(200),
  supplier_rut: optionalText(20),
  document_type: z.enum(projectExpenseDocumentTypes),
  document_number: optionalText(100),
  is_exempt: z.coerce.boolean().default(false),
  net_amount: money("el monto neto"),
  payment_method: optionalText(100),
  notes: optionalText(500),
});
export type ProjectExpenseInput = z.infer<typeof projectExpenseSchema>;

export const voidExpenseSchema = z.object({
  expense_id: uuid,
  reason: required("El motivo de anulación", 3).max(500),
});

export const projectDocumentMetadataSchema = z.object({
  project_id: uuid,
  document_type: z.enum(projectDocumentTypes),
  name: required("El nombre del documento", 1).max(255),
  description: optionalText(500),
  original_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});

export const projectExpenseAttachmentMetadataSchema = z.object({
  expense_id: uuid,
  original_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});

export const projectNoteSchema = z.object({
  project_id: uuid,
  body: required("La observación", 1).max(2000),
});

export const closeProjectSchema = z.object({
  project_id: uuid,
  actual_end_date: z.string().date("Ingresa una fecha válida."),
  closure_notes: required("La observación final", 3).max(1000),
});

export const cancelProjectSchema = z.object({
  project_id: uuid,
  reason: required("El motivo de cancelación", 3).max(500),
});

export const reopenProjectSchema = z.object({
  project_id: uuid,
  comment: optionalText(500),
});

export const MAX_PROJECT_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const allowedProjectAttachmentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

export function validateProjectAttachment(file: File) {
  if (!allowedProjectAttachmentTypes.includes(file.type))
    return "El archivo debe ser PDF, JPG, JPEG o PNG.";
  if (file.size <= 0 || file.size > MAX_PROJECT_ATTACHMENT_SIZE)
    return "El archivo debe pesar entre 1 byte y 10 MB.";
  return null;
}
