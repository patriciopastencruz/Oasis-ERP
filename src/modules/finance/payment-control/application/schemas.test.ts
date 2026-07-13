import { describe, expect, it } from "vitest";
import { paymentRequestSchema, validateAttachment } from "./schemas";

const validFormPayload = {
  id: "",
  company_id: "11111111-1111-4111-8111-111111111111",
  business_unit_id: "22222222-2222-4222-8222-222222222222",
  request_type: "supplier_payment",
  supplier_id: "33333333-3333-4333-8333-333333333333",
  amount: "1000",
  expense_category_id: "44444444-4444-4444-8444-444444444444",
  cost_center_id: "55555555-5555-4555-8555-555555555555",
  priority: "normal",
  requested_payment_date: "",
  description: "Motivo válido",
  notes: "",
};

describe("validación de solicitudes de pago", () => {
  it("acepta exactamente los campos enviados por un borrador nuevo", () => {
    const result = paymentRequestSchema.safeParse(validFormPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBeUndefined();
  });

  it("acepta el UUID de un borrador existente", () => {
    expect(
      paymentRequestSchema.safeParse({
        ...validFormPayload,
        id: "66666666-6666-4666-8666-666666666666",
      }).success,
    ).toBe(true);
  });

  it("rechaza monto no positivo", () => {
    expect(
      paymentRequestSchema.safeParse({ ...validFormPayload, amount: "0" })
        .success,
    ).toBe(false);
  });

  it("exige fecha para una solicitud programada", () => {
    const result = paymentRequestSchema.safeParse({
      ...validFormPayload,
      priority: "scheduled",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.requested_payment_date).toEqual(
        ["La fecha es obligatoria para una solicitud programada."],
      );
    }
  });

  it("acepta una solicitud programada con fecha", () => {
    expect(
      paymentRequestSchema.safeParse({
        ...validFormPayload,
        priority: "scheduled",
        requested_payment_date: "2026-07-30",
      }).success,
    ).toBe(true);
  });

  it("rechaza MIME inválido", () => {
    expect(
      validateAttachment(
        new File(["x"], "x.exe", { type: "application/octet-stream" }),
      ),
    ).toContain("PDF");
  });

  it("rechaza más de 10 MB", () => {
    expect(
      validateAttachment(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toContain("10 MB");
  });
});
