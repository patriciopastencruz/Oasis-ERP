begin;

-- El consumo automático de materia prima al entregar pedidos (dist_consume_order_materials)
-- puede dejar el stock de un material en negativo a propósito (ver migración
-- 20260715030500), que ya dropeó inventory_movements_stock_after_check. Pero
-- inventory_movements_stock_before_check seguía activo: en cuanto un material
-- quedaba negativo, la SIGUIENTE entrega que lo consumiera fallaba con
-- "new row for relation inventory_movements violates check constraint
-- inventory_movements_stock_before_check", bloqueando por completo la entrega
-- de pedidos. Se dropea por consistencia con la misma decisión de diseño; los
-- egresos manuales (register_inventory_output) ya validan saldo suficiente a
-- nivel de aplicación antes de insertar, así que no dependen de este check.
alter table public.inventory_movements drop constraint inventory_movements_stock_before_check;

commit;
