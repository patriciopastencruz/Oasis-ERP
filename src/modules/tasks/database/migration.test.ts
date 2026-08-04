import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260804030000_tasks_board.sql"),
  "utf8",
);

describe("esquema del tablero de tareas", () => {
  it("crea la tabla principal con los 3 estados básicos", () => {
    expect(sql).toContain("create table public.task_cards");
    expect(sql).toContain("status in('pending','in_progress','done')");
  });

  it("es transversal a la compañía, sin depender de una unidad de negocio", () => {
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
