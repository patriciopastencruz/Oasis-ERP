import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261120221003_om_supply_requests.sql"), "utf8");

describe("abastecimiento de Oasis Modulares", () => {
  it("crea los tres roles y los permisos del flujo", () => {
    for (const key of ["foreman", "warehouse_keeper", "buyer"]) expect(sql).toContain(`'${key}'`);
    for (const key of ["inventory.supply.request", "inventory.supply.consolidate", "inventory.supply.buy"]) expect(sql).toContain(`'${key}'`);
  });

  it("todas las tablas tienen company_id, business_unit_id y RLS de solo lectura", () => {
    for (const table of ["om_supply_requests", "om_supply_request_lines", "om_supply_purchase_lists", "om_supply_purchase_items"]) {
      expect(sql).toContain(`create table public.${table}(`);
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(sql.match(/foreign key\(company_id,business_unit_id\) references public\.business_units\(company_id,id\)/g)?.length).toBe(4);
    expect(sql).toContain("grant select on public.om_supply_purchase_lists,public.om_supply_purchase_items,public.om_supply_requests,public.om_supply_request_lines to authenticated;");
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/);
  });

  it("el maestro solo ve sus pedidos y el comprador solo listas emitidas", () => {
    expect(sql).toContain("requested_by=(select auth.uid())");
    expect(sql).toContain("public.has_permission('inventory.supply.buy') and status<>'draft'");
  });

  it("las funciones validan permiso y unidad, y el maestro solo pide en proyectos asignados", () => {
    expect(sql).toContain("No tienes asignado ese proyecto");
    expect(sql).toContain("om_project_members m where m.project_id=pr.id and m.profile_id=me");
    expect(sql.match(/security definer set search_path=''/g)?.length).toBeGreaterThanOrEqual(12);
    expect(sql).toContain("revoke execute on function public.om_supply_unit() from public,anon,authenticated;");
  });

  it("la lista descuenta stock y lo ya comprado y por llegar", () => {
    expect(sql).toContain("greatest(0,g.qty-v_stock-v_transit)");
    expect(sql).toContain("pl.status in('issued','completed')");
    expect(sql).toContain("when i.status='bought' then coalesce(i.bought_quantity,i.quantity_to_buy)");
  });

  it("avisa a bodega, a compras (con correo) y al maestro", () => {
    expect(sql).toContain("inventory.supply_list.review_assigned");
    expect(sql).toContain("inventory.supply_urgent.review_assigned");
    expect(sql).toContain("inventory.supply.request_in_list");
    expect(sql).toContain("inventory.supply.list_completed");
  });

  it("no permite anular una lista con compras y devuelve los pedidos a la cola", () => {
    expect(sql).toContain("La lista ya tiene productos comprados");
    expect(sql).toContain("set status='submitted',purchase_list_id=null");
  });

  it("deja auditoría en cada tabla y un solo borrador por maestro y proyecto", () => {
    expect(sql.match(/execute function public\.audit_row_change\(\)/g)?.length).toBe(4);
    expect(sql).toContain("om_supply_requests_one_draft_idx");
  });
});
