import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) => name.endsWith("_om_supply_edit_sent_requests.sql"));
const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

describe("migración: el maestro corrige su pedido enviado", () => {
  it("va en una transacción y reemplaza solo la función de guardado", () => {
    expect(file).toBeDefined();
    expect(sql).toMatch(/^[\s\S]*begin;[\s\S]*commit;\s*$/);
    expect(sql).toContain("create or replace function public.om_supply_save_request(");
  });

  it("deja editar un pedido enviado, pero no uno que ya está en una lista o anulado", () => {
    expect(sql).toContain("r.status not in('draft','submitted')");
    expect(sql).toContain("El pedido ya esta en una lista de compras o anulado");
    expect(sql).toContain("was_sent:=r.status='submitted'");
  });

  it("avisa a bodega en la app sin enviar correo", () => {
    expect(sql).toContain("'inventory.supply.request_updated'");
    expect(sql).not.toMatch(/request_updated[^']*review_assigned/);
  });

  it("mantiene los permisos de ejecución solo para usuarios autenticados", () => {
    expect(sql).toContain("revoke execute on function public.om_supply_save_request(uuid,jsonb) from public,anon;");
    expect(sql).toContain("grant execute on function public.om_supply_save_request(uuid,jsonb) to authenticated;");
  });
});
