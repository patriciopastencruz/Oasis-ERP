import { describe, expect, it } from "vitest";
import { whatsappAgentOutputSchema } from "./output-schema";

const validOutput = {
  reply: "Hola, gracias por escribirnos. ¿En qué ciudad necesitas el módulo?",
  intent: "qualification",
  leadUpdates: {
    full_name: "Juan Pérez",
    city: null,
    product_interest: "casa",
    bedrooms: null,
    bathrooms: null,
    surface_m2: null,
    budget_clp: null,
  },
  requiresHuman: false,
  reason: null,
};

describe("whatsappAgentOutputSchema", () => {
  it("acepta una salida válida", () => {
    expect(whatsappAgentOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it("rechaza un intent desconocido", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      intent: "vender_casa_gratis",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza reply vacío", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      reply: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza reply demasiado largo", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      reply: "a".repeat(1201),
    });
    expect(result.success).toBe(false);
  });

  it("rechaza leadUpdates con tipos incorrectos", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      leadUpdates: { ...validOutput.leadUpdates, bedrooms: "tres" },
    });
    expect(result.success).toBe(false);
  });

  it("rechaza product_interest fuera del catálogo fijo", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      leadUpdates: { ...validOutput.leadUpdates, product_interest: "piscina" },
    });
    expect(result.success).toBe(false);
  });

  it("normaliza campos ausentes de leadUpdates a null", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      leadUpdates: { full_name: "Juan" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.leadUpdates.city).toBeNull();
      expect(result.data.leadUpdates.bedrooms).toBeNull();
    }
  });

  it("exige requiresHuman como booleano explícito", () => {
    const result = whatsappAgentOutputSchema.safeParse({
      ...validOutput,
      requiresHuman: "true",
    });
    expect(result.success).toBe(false);
  });

  it("acepta reason en null cuando no hay escalamiento", () => {
    const result = whatsappAgentOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reason).toBeNull();
  });
});
