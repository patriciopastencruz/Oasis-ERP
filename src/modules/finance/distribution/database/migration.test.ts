import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = [
  "supabase/migrations/20260714141229_driver_route_orders.sql",
  "supabase/migrations/20260714143207_distinguish_driver_role_from_permissions.sql",
  "supabase/migrations/20260714143432_make_current_role_check_invoker.sql",
  "supabase/migrations/20260714150839_customer_editing_for_administrators.sql",
  "supabase/migrations/20260714181836_enhance_distribution_collection_and_daily_close.sql",
  "supabase/migrations/20260714192547_distribution_raw_material_stock.sql",
  "supabase/migrations/20260715024852_fix_distribution_water_600cc_product.sql",
  "supabase/migrations/20260715030500_distribution_order_raw_material_consumption.sql",
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

describe("cierre diario trazable", () => {
  it("resume productos, entregas, cobros recibidos y gastos", () => {
    expect(sql).toContain("'product_details'");
    expect(sql).toContain("'delivery_rate'");
    expect(sql).toContain("'cash_received'");
    expect(sql).toContain("'transfer_received'");
    expect(sql).toContain("'expense_total'");
  });

  it("protege la lectura transversal de gastos con unidad y permiso", () => {
    expect(sql).toContain("public.can_access_unit");
    expect(sql).toContain(
      "public.has_permission('finance.distribution.reports.view')",
    );
    expect(sql).toContain(
      "revoke all on function public.dist_daily_expenses(uuid,date)",
    );
  });

  it("conserva observaciones en el cierre auditable", () => {
    expect(sql).toContain("add column if not exists observations text");
    expect(sql).toContain(
      "comment on column public.dist_daily_closures.observations",
    );
  });
});

describe("stock de materia prima de la distribuidora", () => {
  it("crea el catálogo inicial completo", () => {
    expect(sql).toContain("ensure_distribution_stock_catalog");
    expect(sql).toContain("DA-MP-ICE-1KG");
    expect(sql).toContain("DA-MP-ICE-2KG");
    expect(sql).toContain("DA-MP-FRAPPE-1KG");
    expect(sql).toContain("DA-MP-FRAPPE-2KG");
    expect(sql).toContain("DA-MP-WATER-20L");
    expect(sql).toContain("DA-MP-WATER-6L");
    expect(sql).toContain("DA-MP-WATER-16L");
    expect(sql).toContain("DA-MP-WATER-600CC");
  });

  it("protege compras, salidas y fotografías por unidad y permiso", () => {
    expect(sql).toContain("finance.distribution.stock.view");
    expect(sql).toContain("finance.distribution.stock.manage");
    expect(sql).toContain("dist_stock_materials_read");
    expect(sql).toContain("dist_stock_invoices_insert");
    expect(sql).toContain("public.can_access_unit");
    expect(sql).toContain("bucket_id='inventory-invoices'");
  });

  it("mantiene un libro mayor y evita stock negativo en salidas manuales", () => {
    expect(sql).toContain("public.inventory_movements");
    expect(sql).toContain("No existe stock suficiente");
    expect(sql).toContain("for update");
  });
});

describe("descuento automático de materia prima por entrega", () => {
  it("corrige el producto de agua a su envase real de 600 cc", () => {
    expect(sql).toContain("code='WATER-500'");
    expect(sql).toContain("code='WATER-600'");
    expect(sql).toContain("name='Agua 600 cc'");
  });

  it("vincula cada producto de venta con su materia prima de empaque", () => {
    expect(sql).toContain("dist_products add column material_id");
    expect(sql).toContain("when 'ICE-1KG' then 'DA-MP-ICE-1KG'");
    expect(sql).toContain("when 'WATER-600' then 'DA-MP-WATER-600CC'");
  });

  it("descuenta stock una sola vez por pedido entregado", () => {
    expect(sql).toContain("dist_orders add column materials_consumed_at");
    expect(sql).toContain(
      "function public.dist_consume_order_materials(target_order uuid)",
    );
    expect(sql).toContain("if o.materials_consumed_at is not null then return; end if;");
    expect(sql).toContain("perform public.dist_consume_order_materials(o.id);");
  });

  it("permite stock negativo de materia prima para anticipar compras", () => {
    expect(sql).toContain(
      "drop constraint inventory_materials_current_stock_check",
    );
    expect(sql).toContain(
      "drop constraint inventory_movements_stock_after_check",
    );
  });

  it("permite que el chofer complete el consumo automático al entregar", () => {
    expect(sql).toContain("materials_consumed_at','updated_by','updated_at'");
  });
});
