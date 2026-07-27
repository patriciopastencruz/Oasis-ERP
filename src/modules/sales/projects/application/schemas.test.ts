import { describe, expect, it } from "vitest";
import {
  cancelProjectSchema,
  closeProjectSchema,
  convertQuotationSchema,
  createProjectSchema,
  projectExpenseSchema,
  projectMemberSchema,
  validateProjectAttachment,
} from "./schemas";

const validResponsible = "11111111-1111-4111-8111-111111111111";

describe("createProjectSchema", () => {
  it("acepta un proyecto manual válido", () => {
    const result = createProjectSchema.safeParse({
      name: "Modulo casa 60m2",
      client_company: "Constructora Andes",
      responsible_id: validResponsible,
      net_income: 15000000,
      estimated_start_date: "2026-08-01",
      estimated_end_date: "2026-09-01",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const result = createProjectSchema.safeParse({
      name: "",
      client_company: "Cliente",
      responsible_id: validResponsible,
      net_income: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza ingreso neto negativo", () => {
    const result = createProjectSchema.safeParse({
      name: "Proyecto X",
      client_company: "Cliente",
      responsible_id: validResponsible,
      net_income: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza fecha de término anterior a la de inicio", () => {
    const result = createProjectSchema.safeParse({
      name: "Proyecto X",
      client_company: "Cliente",
      responsible_id: validResponsible,
      net_income: 1000,
      estimated_start_date: "2026-09-01",
      estimated_end_date: "2026-08-01",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza responsable inválido", () => {
    const result = createProjectSchema.safeParse({
      name: "Proyecto X",
      client_company: "Cliente",
      responsible_id: "no-es-un-uuid",
      net_income: 1000,
    });
    expect(result.success).toBe(false);
  });
});

describe("convertQuotationSchema", () => {
  it("no exige cliente (viene de la cotización)", () => {
    const result = convertQuotationSchema.safeParse({
      quotation_id: validResponsible,
      responsible_id: validResponsible,
    });
    expect(result.success).toBe(true);
  });
});

describe("projectMemberSchema", () => {
  it("exige profile_id cuando el tipo es usuario", () => {
    const result = projectMemberSchema.safeParse({
      member_type: "user",
      role: "instalador",
    });
    expect(result.success).toBe(false);
  });
  it("exige external_name cuando el tipo es externo", () => {
    const result = projectMemberSchema.safeParse({
      member_type: "external",
      role: "colaborador_externo",
    });
    expect(result.success).toBe(false);
  });
  it("acepta un integrante externo con nombre", () => {
    const result = projectMemberSchema.safeParse({
      member_type: "external",
      external_name: "Juan Pérez",
      role: "colaborador_externo",
    });
    expect(result.success).toBe(true);
  });
});

describe("projectExpenseSchema", () => {
  it("rechaza monto neto negativo", () => {
    const result = projectExpenseSchema.safeParse({
      project_id: validResponsible,
      expense_date: "2026-08-05",
      category: "materiales",
      description: "Perfiles de aluminio",
      document_type: "factura",
      net_amount: -500,
    });
    expect(result.success).toBe(false);
  });
  it("rechaza categoría inválida", () => {
    const result = projectExpenseSchema.safeParse({
      project_id: validResponsible,
      expense_date: "2026-08-05",
      category: "no-existe",
      description: "Algo",
      document_type: "factura",
      net_amount: 100,
    });
    expect(result.success).toBe(false);
  });
  it("acepta un gasto exento sin monto de IVA explícito", () => {
    const result = projectExpenseSchema.safeParse({
      project_id: validResponsible,
      expense_date: "2026-08-05",
      category: "transporte",
      description: "Flete",
      document_type: "factura_exenta",
      is_exempt: true,
      net_amount: 80000,
    });
    expect(result.success).toBe(true);
  });
});

describe("closeProjectSchema / cancelProjectSchema", () => {
  it("exige observación final al cerrar", () => {
    const result = closeProjectSchema.safeParse({
      project_id: validResponsible,
      actual_end_date: "2026-08-20",
      closure_notes: "",
    });
    expect(result.success).toBe(false);
  });
  it("exige motivo al cancelar", () => {
    const result = cancelProjectSchema.safeParse({
      project_id: validResponsible,
      reason: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateProjectAttachment", () => {
  it("rechaza tipos de archivo no permitidos", () => {
    const file = new File(["x"], "malware.exe", {
      type: "application/x-msdownload",
    });
    expect(validateProjectAttachment(file)).not.toBeNull();
  });
  it("rechaza archivos sobre 10 MB", () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "a.pdf", {
      type: "application/pdf",
    });
    expect(validateProjectAttachment(big)).not.toBeNull();
  });
  it("acepta un PDF válido", () => {
    const file = new File(["x"], "respaldo.pdf", {
      type: "application/pdf",
    });
    expect(validateProjectAttachment(file)).toBeNull();
  });
});
