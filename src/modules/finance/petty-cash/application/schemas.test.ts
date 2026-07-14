import { describe, expect, it } from "vitest";
import { attachmentMetadataSchema, expenseLineSchema, reportDraftSchema } from "./schemas";

const line = {
  client_id: "line-1",
  expense_date: "2026-07-13",
  merchant_name: "Comercio",
  document_type: "receipt",
  document_number: "1",
  expense_category_id: "11111111-1111-4111-8111-111111111111",
  cost_center_id: "22222222-2222-4222-8222-222222222222",
  description: "Compra menor",
  amount: 35000,
  observation: "",
  sort_order: 0,
};

describe("validación de rendiciones", () => {
  it("acepta una línea completa", () => expect(expenseLineSchema.safeParse(line).success).toBe(true));
  it("rechaza montos cero", () => expect(expenseLineSchema.safeParse({ ...line, amount: 0 }).success).toBe(false));
  it("exige al menos una línea", () => {
    const result = reportDraftSchema.safeParse({
      business_unit_id: "33333333-3333-4333-8333-333333333333",
      week_start: "2026-07-13",
      week_end: "2026-07-19",
      general_reason: "Gastos semanales",
      lines: [],
    });
    expect(result.success).toBe(false);
  });
  it("acepta metadatos de un comprobante de hasta 10 MB", () => {
    expect(attachmentMetadataSchema.safeParse({
      report_id: "33333333-3333-4333-8333-333333333333",
      expense_line_id: "44444444-4444-4444-8444-444444444444",
      original_name: "boleta.pdf",
      mime_type: "application/pdf",
      size_bytes: 10 * 1024 * 1024,
    }).success).toBe(true);
  });
  it("rechaza metadatos de un comprobante mayor a 10 MB", () => {
    expect(attachmentMetadataSchema.safeParse({
      report_id: "33333333-3333-4333-8333-333333333333",
      expense_line_id: "44444444-4444-4444-8444-444444444444",
      original_name: "boleta.pdf",
      mime_type: "application/pdf",
      size_bytes: 10 * 1024 * 1024 + 1,
    }).success).toBe(false);
  });
});
