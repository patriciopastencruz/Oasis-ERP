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
  "supabase/migrations/20260715032629_distribution_order_editing.sql",
  "supabase/migrations/20260715040000_distribution_delivery_payment_capture.sql",
  "supabase/migrations/20260715040440_distribution_order_void.sql",
  "supabase/migrations/20260715210123_deterministic_price_resolution.sql",
  "supabase/migrations/20260715220000_fix_inventory_movements_negative_stock_before.sql",
  "supabase/migrations/20260716010000_distribution_driver_closures.sql",
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

describe("edición de pedidos antes de la entrega", () => {
  it("recalcula precios, descuento y total al editar productos y cantidades", () => {
    expect(sql).toContain(
      "function public.dist_update_order(target_order uuid,payload jsonb)",
    );
    expect(sql).toContain("dist_resolve_price");
    expect(sql).toContain("delete from public.dist_order_lines");
  });

  it("bloquea la edición de pedidos entregados, cancelados o anulados", () => {
    expect(sql).toContain(
      "if o.status in('delivered','partially_delivered','cancelled','voided') then raise exception 'El pedido ya no admite ediciones'",
    );
  });

  it("exige que el Administrativo solicite la edición con productos válidos", () => {
    expect(sql).toContain("if request_type='edit' then");
    expect(sql).toContain("'La edicion requiere productos'");
  });

  it("aplica la edición solo cuando el Administrador aprueba la solicitud", () => {
    expect(sql).toContain("perform public.dist_update_order(o.id,r.proposed_data)");
  });
});

describe("cobro automático al entregar pedidos de contado", () => {
  it("exige el medio de pago al entregar pedidos que no son a crédito", () => {
    expect(sql).toContain("target_status in('delivered','partially_delivered') and o.payment_condition<>'credit'");
    expect(sql).toContain(
      "if method is null or method not in('cash','transfer') then raise exception 'Medio de pago obligatorio'",
    );
  });

  it("registra el cobro completo del pedido a través del helper compartido", () => {
    expect(sql).toContain(
      "function public.dist_register_payment_core(o public.dist_orders,payment_amount numeric,payment_method text,receipt text,notes_text text,idempotency text)",
    );
    expect(sql).toContain(
      "perform public.dist_register_payment_core(o,o.total,method,'','Cobro registrado al entregar','delivery:'||o.id::text)",
    );
  });

  it("no exige medio de pago para pedidos a crédito", () => {
    expect(sql).toContain("o.payment_condition<>'credit'");
  });
});

describe("anulación de pedidos antes de la entrega", () => {
  it("permite que el Administrador anule directamente con motivo obligatorio", () => {
    expect(sql).toContain(
      "function public.dist_void_order(target_order uuid,reason_text text)",
    );
    expect(sql).toContain("if length(trim(reason_text))<3 then raise exception 'El motivo es obligatorio'");
  });

  it("solo anula pedidos programados o asignados", () => {
    expect(sql).toContain(
      "if o.status not in('scheduled','assigned') then raise exception 'El pedido ya no admite anulación directa'",
    );
    expect(sql).toContain(
      "elsif request_type='void' and o.status not in('scheduled','assigned') then",
    );
  });

  it("no permite que el recálculo de payment_status pise una anulación", () => {
    expect(sql).toContain(
      "if new.payment_status is distinct from old.payment_status and new.payment_status<>'voided' then",
    );
  });
});

describe("resolución determinística de precios por cliente", () => {
  it("desempata precios con la misma fecha de vigencia por el más reciente", () => {
    expect(sql).toContain(
      "order by (p.customer_id is not null) desc,p.valid_from desc,p.created_at desc limit 1",
    );
  });
});

describe("consumo automático de materia prima con stock negativo", () => {
  it("permite que el stock previo a un movimiento quede negativo", () => {
    expect(sql).toContain(
      "alter table public.inventory_movements drop constraint inventory_movements_stock_before_check",
    );
  });
});

describe("cierre de caja simple del chofer", () => {
  it("crea la tabla con un cierre único por chofer, unidad y fecha", () => {
    expect(sql).toContain("create table public.dist_driver_closures");
    expect(sql).toContain("unique(business_unit_id,driver_id,closure_date)");
  });

  it("solo el propio chofer puede declarar o corregir su cierre", () => {
    expect(sql).toContain(
      "create policy dist_driver_closures_insert on public.dist_driver_closures for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.driver') and driver_id=(select auth.uid()) and not public.dist_closed(business_unit_id,closure_date))",
    );
    expect(sql).toContain(
      "create policy dist_driver_closures_update on public.dist_driver_closures for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and driver_id=(select auth.uid()) and not public.dist_closed(business_unit_id,closure_date))",
    );
  });

  it("bloquea la declaración una vez cerrada formalmente la jornada", () => {
    expect(sql).toContain("not public.dist_closed(business_unit_id,closure_date)");
  });

  it("hace dist_closed security definer para que el chofer también vea la jornada cerrada", () => {
    expect(sql).toContain(
      "function public.dist_closed(target_unit uuid,target_date date) returns boolean language sql stable security definer",
    );
  });

  it("incorpora las declaraciones de los choferes al snapshot del cierre diario", () => {
    expect(sql).toContain(
      "function public.dist_driver_closures_summary(target_unit uuid,target_date date)",
    );
    expect(sql).toContain(
      "'driver_closures',public.dist_driver_closures_summary(target_unit,target_date)",
    );
  });
});
