import { describe, expect, it } from "vitest";
import { createUserSchema } from "./user-schema";
const id1 = "11111111-1111-4111-8111-111111111111",
  id2 = "22222222-2222-4222-8222-222222222222",
  valid = {
    first_name: "Ana",
    last_name: "Pérez",
    email: "ana@example.cl",
    job_title: "Administradora",
    role_id: id1,
    company_ids: [id1],
    unit_ids: [id2],
    password: "ClaveSegura123",
    password_confirmation: "ClaveSegura123",
  };
describe("create user assignments", () => {
  it("rechaza empresa vacía con mensaje en español", () => {
    const r = createUserSchema.safeParse({ ...valid, company_ids: [] });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.flatten().fieldErrors.company_ids).toContain(
        "Debes asignar al menos una empresa.",
      );
  });
  it("rechaza unidad vacía con mensaje en español", () => {
    const r = createUserSchema.safeParse({ ...valid, unit_ids: [] });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.flatten().fieldErrors.unit_ids).toContain(
        "Debes asignar al menos una unidad de negocio.",
      );
  });
  it("acepta una creación válida", () =>
    expect(createUserSchema.safeParse(valid).success).toBe(true));
  it("acepta acceso a todas las unidades mediante selección explícita", () =>
    expect(
      createUserSchema.safeParse({ ...valid, unit_ids: [id1, id2] }).success,
    ).toBe(true));
  it("rechaza una contraseña inicial corta", () => {
    const r = createUserSchema.safeParse({
      ...valid,
      password: "corta",
      password_confirmation: "corta",
    });
    expect(r.success).toBe(false);
  });
  it("rechaza contraseñas que no coinciden", () => {
    const r = createUserSchema.safeParse({
      ...valid,
      password_confirmation: "OtraClave123",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.flatten().fieldErrors.password_confirmation).toContain(
        "Las contraseñas no coinciden.",
      );
  });
});
