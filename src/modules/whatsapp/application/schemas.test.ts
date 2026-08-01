import { describe, expect, it } from "vitest";
import {
  integrationSettingsSchema,
  leadEditSchema,
  manualReplySchema,
} from "./schemas";

describe("manualReplySchema", () => {
  it("acepta un mensaje válido", () => {
    expect(
      manualReplySchema.safeParse({
        conversation_id: "11111111-1111-4111-8111-111111111111",
        content: "Hola, te escribe Pedro de Oasis Modulares.",
      }).success,
    ).toBe(true);
  });
  it("rechaza contenido vacío", () => {
    expect(
      manualReplySchema.safeParse({
        conversation_id: "11111111-1111-4111-8111-111111111111",
        content: "   ",
      }).success,
    ).toBe(false);
  });
  it("rechaza un conversation_id inválido", () => {
    expect(
      manualReplySchema.safeParse({
        conversation_id: "no-es-uuid",
        content: "hola",
      }).success,
    ).toBe(false);
  });
});

describe("leadEditSchema", () => {
  it("acepta campos en null (formulario recargado desde la base de datos) y los normaliza", () => {
    const result = leadEditSchema.safeParse({
      full_name: null,
      city: null,
      product_interest: null,
      bedrooms: null,
      bathrooms: null,
      surface_m2: null,
      budget_clp: null,
      assigned_user_id: null,
      status: null,
      source_notes: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe("");
      expect(result.data.city).toBe("");
      expect(result.data.source_notes).toBe("");
    }
  });

  it("rechaza un product_interest fuera del catálogo fijo", () => {
    const result = leadEditSchema.safeParse({ product_interest: "piscina" });
    expect(result.success).toBe(false);
  });

  it("rechaza un status desconocido", () => {
    const result = leadEditSchema.safeParse({ status: "en_negociacion" });
    expect(result.success).toBe(false);
  });

  it("acepta strings numéricos de un formulario HTML y los convierte", () => {
    const result = leadEditSchema.safeParse({ bedrooms: "3", budget_clp: "25000000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bedrooms).toBe(3);
      expect(result.data.budget_clp).toBe(25000000);
    }
  });
});

describe("integrationSettingsSchema", () => {
  it("exige nombre de agente y mensaje de respaldo", () => {
    expect(
      integrationSettingsSchema.safeParse({
        provider: "twilio",
        phone_number_e164: "+14155238886",
        display_name: "Oasis Modulares",
        agent_name: "",
        fallback_message: "",
        enabled: true,
        automation_enabled: true,
      }).success,
    ).toBe(false);
  });

  it("rechaza un número que no está en formato E.164", () => {
    expect(
      integrationSettingsSchema.safeParse({
        provider: "twilio",
        phone_number_e164: "56912345678",
        display_name: "Oasis Modulares",
        agent_name: "Asistente Oasis",
        fallback_message: "En breve un vendedor te responde.",
        enabled: true,
        automation_enabled: false,
      }).success,
    ).toBe(false);
  });

  it("acepta una configuración completa", () => {
    expect(
      integrationSettingsSchema.safeParse({
        provider: "twilio",
        phone_number_e164: "+17372212163",
        display_name: "Oasis Modulares",
        agent_name: "Asistente Oasis",
        fallback_message: "En breve un vendedor te responde.",
        enabled: true,
        automation_enabled: false,
      }).success,
    ).toBe(true);
  });
});
