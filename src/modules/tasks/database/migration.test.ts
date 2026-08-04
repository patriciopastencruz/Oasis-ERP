import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260804030000_tasks_board.sql"),
  "utf8",
);
const businessUnitSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260804040000_tasks_board_business_unit.sql",
  ),
  "utf8",
);

describe("esquema del tablero de tareas", () => {
  it("crea la tabla principal con los 3 estados básicos", () => {
    expect(sql).toContain("create table public.task_cards");
    expect(sql).toContain("status in('pending','in_progress','done')");
  });

  it("es transversal a la compañía, sin fijar una unidad de negocio obligatoria", () => {
    expect(sql).not.toContain("business_unit_id");
  });

  it("habilita RLS y valida la compañía en cada función de mutación", () => {
    expect(sql).toContain("alter table public.task_cards enable row level security");
    expect(sql).toContain("create or replace function public.tasks_create_card");
    expect(sql).toContain("create or replace function public.tasks_move_card");
    expect(sql).toContain("create or replace function public.tasks_delete_card");
    expect(sql.match(/public\.can_access_company/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("da acceso de gestión a todos los roles, no solo a algunos", () => {
    expect(sql).toContain(
      "select r.id,p.id from public.roles r cross join public.permissions p\nwhere p.key in('tasks.board.view','tasks.board.manage')",
    );
  });
});

describe("unidad de negocio opcional por tarjeta", () => {
  it("agrega la columna como opcional (nullable), no como filtro obligatorio del tablero", () => {
    expect(businessUnitSql).toContain(
      "alter table public.task_cards add column business_unit_id uuid",
    );
    expect(businessUnitSql).not.toMatch(/business_unit_id uuid not null/);
  });

  it("la ata a la compañía de la tarjeta con FK compuesta, como en el resto del repo", () => {
    expect(businessUnitSql).toContain(
      "foreign key(company_id,business_unit_id) references public.business_units(company_id,id)",
    );
  });

  it("valida en servidor que la unidad elegida pertenezca a la compañía de la tarjeta", () => {
    expect(businessUnitSql).toContain(
      "La unidad de negocio no pertenece a esta compania",
    );
  });
});
