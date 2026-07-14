import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = [
  "supabase/migrations/20260714141229_driver_route_orders.sql",
  "supabase/migrations/20260714143207_distinguish_driver_role_from_permissions.sql",
  "supabase/migrations/20260714143432_make_current_role_check_invoker.sql",
  "supabase/migrations/20260714150839_customer_editing_for_administrators.sql",
]
  .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
  .join("\n");

describe("pedidos no planificados del chofer", () => {
  it("asigna la venta en ruta al chofer autenticado", () => {
    expect(sql).toContain("public.current_user_has_role('driver')");
    expect(sql).toContain("new.driver_id := (select auth.uid())");
    expect(sql).toContain("new.status := 'assigned'");
  });

  it("no confunde permisos globales con el rol Chofer", () => {
    expect(sql).toContain("r.key = target_role");
    expect(sql).toContain("Solo el rol Chofer puede registrar ventas en ruta");
    expect(sql).toContain(
      "if public.current_user_has_role('driver') and o.driver_id <> auth.uid()",
    );
  });

  it("mantiene la función con permisos del invocador", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke execute");
  });
});

describe("edición segura de clientes", () => {
  it("reserva edición y eliminación para Administrador y roles superiores", () => {
    expect(sql).toContain("finance.distribution.customers.edit");
    expect(sql).toContain(
      "('administrator', 'operations_manager', 'general_manager', 'superadmin')",
    );
    expect(sql).toContain("create policy dist_customers_update");
  });

  it("conserva los registros comerciales mediante eliminación lógica", () => {
    expect(sql).toContain("deleted_at");
    expect(sql).not.toContain("create policy dist_customers_delete");
  });
});
