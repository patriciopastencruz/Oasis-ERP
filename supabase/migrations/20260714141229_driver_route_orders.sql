-- Los pedidos creados durante una ruta quedan inmediatamente asociados al
-- chofer autenticado. Se mantiene SECURITY INVOKER para respetar RLS.
create or replace function public.dist_prepare_driver_route_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.route_sale and public.has_permission('finance.distribution.driver') then
    if new.created_by is distinct from (select auth.uid()) then
      raise exception 'El pedido en ruta debe pertenecer al chofer autenticado';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        new.business_unit_id::text || ':' || new.delivery_date::text || ':' || (select auth.uid())::text,
        0
      )
    );

    new.driver_id := (select auth.uid());
    select coalesce(max(route_position), 0) + 1
      into new.route_position
      from public.dist_orders
     where business_unit_id = new.business_unit_id
       and delivery_date = new.delivery_date
       and driver_id = (select auth.uid())
       and status not in ('cancelled', 'voided');
    new.status := 'assigned';
  end if;

  return new;
end;
$$;

drop trigger if exists dist_prepare_driver_route_order on public.dist_orders;
create trigger dist_prepare_driver_route_order
before insert on public.dist_orders
for each row execute function public.dist_prepare_driver_route_order();

revoke execute on function public.dist_prepare_driver_route_order() from public, anon, authenticated;
