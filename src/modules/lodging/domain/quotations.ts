import { z } from "zod";

export const QUOTATION_IVA_RATE = 0.19;
export const QUOTATION_MAX_LINES = 20;
export const QUOTATION_MAX_PHOTOS = 4;

export const DEFAULT_SERVICE_DETAIL =
  "Hospedaje por noches; 1 persona; 1 habitación\nHabitaciones completamente amobladas.";

export type QuotationLineInput = {
  description: string;
  quantity: number;
  unit_net: number;
  nights: number;
};

/** Mismo cálculo que la función de base de datos: IVA redondeado por línea. */
export function lineTotals(line: Pick<QuotationLineInput, "quantity" | "unit_net" | "nights">) {
  const subtotal = line.quantity * line.unit_net * line.nights;
  const iva = Math.round(subtotal * QUOTATION_IVA_RATE);
  return { subtotal, iva, total: subtotal + iva };
}

export function quotationTotals(lines: Pick<QuotationLineInput, "quantity" | "unit_net" | "nights">[]) {
  return lines.reduce(
    (acc, l) => {
      const t = lineTotals(l);
      return { net: acc.net + t.subtotal, iva: acc.iva + t.iva, total: acc.total + t.total };
    },
    { net: 0, iva: 0, total: 0 },
  );
}

/** Noches entre dos fechas ISO (yyyy-mm-dd); null si faltan o no son válidas. */
export function nightsBetween(checkIn: string, checkOut: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  const diff = Math.round(
    (Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86_400_000,
  );
  return diff > 0 ? diff : null;
}

const optionalText = (max: number) => z.string().trim().max(max).default("");
const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Fecha no válida.")
  .default("");

export const quotationLineSchema = z.object({
  description: z.string().trim().min(1, "Cada ítem necesita una descripción.").max(200),
  quantity: z.coerce.number().int("La cantidad debe ser un número entero.").min(1).max(100),
  unit_net: z.coerce.number().int("El valor unitario debe ser un número entero.").min(0).max(100_000_000),
  nights: z.coerce.number().int("Las noches deben ser un número entero.").min(1).max(365),
});

export const quotationFormSchema = z
  .object({
    client_company: z.string().trim().min(2, "Indica la empresa.").max(160),
    client_rut: optionalText(30),
    client_contact: optionalText(160),
    client_email: optionalText(160),
    hostel_address: optionalText(200),
    service_detail: optionalText(1000),
    check_in: optionalDate,
    check_out: optionalDate,
    lines: z
      .array(quotationLineSchema)
      .min(1, "La cotización requiere al menos un ítem.")
      .max(QUOTATION_MAX_LINES, `Máximo ${QUOTATION_MAX_LINES} ítems.`),
  })
  .refine((v) => !v.check_in || !v.check_out || v.check_out > v.check_in, {
    message: "La salida debe ser posterior a la entrada.",
    path: ["check_out"],
  });

export type QuotationFormInput = z.infer<typeof quotationFormSchema>;

/** Cada línea del detalle del servicio pasa a ser una viñeta en el PDF. */
export function serviceBullets(detail: string | null | undefined) {
  return (detail ?? "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}
