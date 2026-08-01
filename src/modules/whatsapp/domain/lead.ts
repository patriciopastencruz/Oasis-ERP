export const leadStatuses = [
  "new",
  "contacted",
  "qualifying",
  "qualified",
  "quotation_requested",
  "won",
  "lost",
  "discarded",
] as const;
export type LeadStatus = (typeof leadStatuses)[number];

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualifying: "Calificando",
  qualified: "Calificado",
  quotation_requested: "Cotización solicitada",
  won: "Ganado",
  lost: "Perdido",
  discarded: "Descartado",
};

export const leadChannels = ["whatsapp", "manual", "web"] as const;
export type LeadChannel = (typeof leadChannels)[number];

export const productInterests = ["casa", "oficina", "bano", "otro"] as const;
export type ProductInterest = (typeof productInterests)[number];

export const productInterestLabels: Record<ProductInterest, string> = {
  casa: "Casa modular",
  oficina: "Oficina modular",
  bano: "Baño modular",
  otro: "Otro",
};

export type LeadQualificationFields = {
  full_name: string | null;
  city: string | null;
  product_interest: ProductInterest | null;
  bedrooms: number | null;
  bathrooms: number | null;
  surface_m2: number | null;
  budget_clp: number | null;
  phone_e164: string;
};

/**
 * Orden de las preguntas progresivas que el agente debe ir haciendo, una o
 * dos por mensaje (nunca todas juntas) — ver system-prompt.ts. Devuelve los
 * campos que aún faltan, en el orden en que se deberían preguntar.
 */
export function missingQualificationFields(
  lead: Partial<LeadQualificationFields>,
): (keyof LeadQualificationFields)[] {
  const order: (keyof LeadQualificationFields)[] = [
    "full_name",
    "city",
    "product_interest",
    "bedrooms",
    "bathrooms",
    "surface_m2",
    "budget_clp",
  ];
  return order.filter((field) => {
    const value = lead[field];
    return value === null || value === undefined || value === "";
  });
}
