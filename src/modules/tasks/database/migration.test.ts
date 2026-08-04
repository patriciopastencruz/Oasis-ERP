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
const roleRestrictionsSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260804050000_tasks_board_role_restrictions.sql",
  ),
  "utf8",
);
const colorSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260804060000_business_units_color.sql",
  ),
  "utf8",
);
const attachmentsSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260804070000_tasks_board_attachments.sql",
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

  it("parte dando acceso de gestión a todos los roles (se restringe en una migración posterior)", () => {
    expect(sql).toContain(
      "select r.id,p.id from public.roles r cross join public.permissions p\nwhere p.key in('tasks.board.view','tasks.board.manage')",
    );
  });
});

describe("gestión reservada a roles gerenciales/administrativos", () => {
  it("quita tasks.board.manage a los roles que no son de gestión, dejando solo los aprobados", () => {
    expect(roleRestrictionsSql).toContain(
      "r.key not in('superadmin','general_manager','area_manager','operations_manager','administrator')",
    );
  });

  it("mover una tarjeta pasa a security definer para permitir que el responsable mueva la suya sin permiso de gestión", () => {
    expect(roleRestrictionsSql).toContain(
      "create or replace function public.tasks_move_card(target_card uuid,target_status text) returns void language plpgsql security definer",
    );
    expect(roleRestrictionsSql).toContain(
      "if not (public.has_permission('tasks.board.manage') or c.assignee_id=me) then raise exception 'Sin autorizacion'; end if;",
    );
  });

  it("no deja el tablero abierto a cualquiera: revoca el execute público de la función definer", () => {
    expect(roleRestrictionsSql).toContain(
      "revoke execute on function public.tasks_move_card(uuid,text) from public,anon",
    );
  });
});

describe("color por unidad de negocio", () => {
  it("agrega la columna como hex opcional, validado con check", () => {
    expect(colorSql).toContain(
      "alter table public.business_units add column color text check(color ~ '^#[0-9a-f]{6}$')",
    );
  });

  it("expone el color en tasks_list_company_units para pintar las tarjetas", () => {
    expect(colorSql).toContain(
      "returns table(id uuid,code text,name text,color text)",
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

describe("adjuntos de respaldo por tarjeta", () => {
  it("crea la tabla y el bucket privado dedicados", () => {
    expect(attachmentsSql).toContain("create table public.task_card_attachments");
    expect(attachmentsSql).toContain(
      "values ('task-card-attachments','task-card-attachments',false,10485760,array['application/pdf','image/jpeg','image/png'])",
    );
  });

  it("solo deja subir/borrar al responsable de la tarjeta o a quien tenga gestión, no a cualquiera con acceso al tablero", () => {
    expect(attachmentsSql).toContain(
      "and (c.assignee_id=auth.uid() or public.has_permission('tasks.board.manage'))",
    );
    expect(attachmentsSql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("el borrado es físico: la tabla de adjuntos no tiene columna deleted_at propia (el archivo desaparece de Storage y de la fila a la vez)", () => {
    const tableDefinition = attachmentsSql.slice(
      attachmentsSql.indexOf("create table public.task_card_attachments"),
      attachmentsSql.indexOf("create index task_card_attachments_card_idx"),
    );
    expect(tableDefinition).not.toContain("deleted_at");
  });
});
