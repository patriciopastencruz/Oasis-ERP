import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((f) => f.endsWith("_om_shared_pages.sql"));
const sql = file ? readFileSync(join(dir, file), "utf8") : "";

describe("migración: páginas compartidas de Oasis Modulares", () => {
  it("va dentro de una transacción", () => {
    expect(file).toBeTruthy();
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });

  it("separa el contenido del registro auditado y activa RLS en ambas tablas", () => {
    expect(sql).toContain("create table public.om_shared_pages(");
    expect(sql).toContain("create table public.om_shared_page_contents(");
    expect(sql).toContain("alter table public.om_shared_pages enable row level security");
    expect(sql).toContain("alter table public.om_shared_page_contents enable row level security");
    expect(sql).toContain("create trigger audit_om_shared_pages");
    expect(sql).not.toContain("audit_om_shared_page_contents");
  });

  it("exige el permiso de cotizaciones y la unidad, y concede solo lo necesario", () => {
    expect(sql).toContain("public.has_permission('sales.quotations.create')");
    expect(sql).toContain("public.can_access_unit(company_id,business_unit_id)");
    expect(sql).toContain("revoke all on public.om_shared_pages from public,anon,authenticated");
    expect(sql).toContain("grant select,insert,update on public.om_shared_pages to authenticated,service_role");
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*om_shared_page/);
  });

  it("crea y reemplaza el archivo en funciones que respetan RLS", () => {
    expect(sql).toContain("create function public.om_create_shared_page(");
    expect(sql).toContain("create function public.om_replace_shared_page_html(");
    expect(sql.match(/security invoker/g)?.length).toBe(2);
    expect(sql).toContain("revoke execute on function public.om_create_shared_page(text,text,text,text) from public,anon");
  });
});
