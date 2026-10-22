import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261022170000_lodging_expenses.sql", "utf8");

describe("migración de gastos del hostal", () => {
  it("protege la tabla con RLS, solo lectura directa y auditoría", () => {
    expect(sql).toContain("alter table public.lodging_expenses enable row level security");
    expect(sql).toContain("revoke all on public.lodging_expenses from public,anon,authenticated");
    expect(sql).toContain("grant select on public.lodging_expenses to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*lodging_expenses/);
    expect(sql).not.toContain("using(true)");
    expect(sql).toContain("audit_row_change");
    expect(sql).toContain("can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.expenses.view')");
  });

  it("lleva empresa y unidad, índices y no permite eliminar gastos", () => {
    expect(sql).toContain("foreign key(company_id,business_unit_id) references public.business_units(company_id,id)");
    expect(sql).toContain("create index lodging_expenses_unit_date_idx");
    expect(sql).toContain("create index lodging_expenses_category_idx");
    expect(sql).toContain("check((voided_at is null)=(void_reason is null))");
    expect(sql).not.toMatch(/delete from public\.lodging_expenses/);
  });

  it("ingresar y anular exigen permiso; administrar tipos exige gestión", () => {
    expect(sql).toMatch(/lodging_record_expense[\s\S]*has_permission\('lodging\.expenses\.record'\)/);
    expect(sql).toMatch(/lodging_void_expense[\s\S]*has_permission\('lodging\.expenses\.record'\)/);
    expect(sql.match(/has_permission\('lodging\.expenses\.manage'\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("Solo puedes anular un gasto que ingresaste hoy");
  });

  it("por ahora solo existe en Hostal Uruguay y la recepcionista puede ingresar", () => {
    expect(sql).toContain("unit.code not in('HU')");
    expect(sql).toMatch(/p\.key in\('lodging\.expenses\.view','lodging\.expenses\.record'\)[\s\S]*'receptionist'/);
    expect(sql).toMatch(/p\.key='lodging\.expenses\.manage'[\s\S]*not|p\.key='lodging\.expenses\.manage'/);
  });

  it("siembra los tipos pedidos: aseo y limpieza, luz, agua, gas e insumos de cocina", () => {
    for (const name of ["Aseo y limpieza", "Luz", "Agua", "Insumos de cocina", "Gas y combustible"]) expect(sql).toContain(name);
  });
});
