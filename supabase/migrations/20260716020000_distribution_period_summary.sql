begin;

-- Resumen agregado por rango de fechas (semana, mes, etc.) para la sección
-- "Reporte por período" de Cierre y reportes. dist_daily_summary sigue
-- siendo el resumen de un solo día; esta función agrega sobre varios días y
-- entrega además la serie diaria de ventas para el gráfico.
create or replace function public.dist_period_summary(target_unit uuid,date_from date,date_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
begin
 if date_from is null or date_to is null or date_from>date_to or (date_to-date_from)>366 then
  raise exception 'Rango de fechas inválido';
 end if;
 return (
  with days as (
    select generate_series(date_from,date_to,'1 day'::interval)::date as day
  ),
  orders as (
    select o.*
    from public.dist_orders o
    where o.business_unit_id=target_unit
      and o.delivery_date between date_from and date_to
      and o.deleted_at is null
      and o.status not in('cancelled','voided')
  ),
  delivered_orders as (
    select * from orders where status in('delivered','partially_delivered')
  ),
  lines as (
    select l.order_id,coalesce(l.delivered_quantity,l.planned_quantity) quantity,p.ice_weight_kg
    from public.dist_order_lines l
    join delivered_orders o on o.id=l.order_id
    join public.dist_products p on p.id=l.product_id
  ),
  daily_sales as (
    select delivery_date as day,sum(total) sales
    from delivered_orders
    group by delivery_date
  ),
  daily as (
    select d.day,coalesce(ds.sales,0) sales
    from days d left join daily_sales ds on ds.day=d.day
    order by d.day
  ),
  credit_orders as (
    select o.id,o.total
    from public.dist_orders o
    where o.business_unit_id=target_unit
      and o.payment_condition='credit'
      and o.status in('delivered','partially_delivered')
      and o.deleted_at is null
  ),
  credit_paid as (
    select a.order_id,sum(a.amount) paid
    from public.dist_payment_allocations a
    join public.dist_payments p on p.id=a.payment_id and p.status='confirmed'
    group by a.order_id
  ),
  outstanding as (
    select coalesce(sum(greatest(co.total-coalesce(cp.paid,0),0)),0) total
    from credit_orders co left join credit_paid cp on cp.order_id=co.id
  )
  select jsonb_build_object(
    'days',(date_to-date_from)+1,
    'orders_total',(select count(*) from orders),
    'delivered_sales',coalesce((select sum(total) from delivered_orders),0),
    'planned_sales',coalesce((select sum(total) from orders),0),
    'total_kg',coalesce((select sum(quantity*ice_weight_kg) from lines),0),
    'total_units',coalesce((select sum(quantity) from lines),0),
    'outstanding_credit',(select total from outstanding),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day,'sales',sales) order by day) from daily),'[]'::jsonb)
  )
 );
end
$$;

revoke all on function public.dist_period_summary(uuid,date,date) from public,anon;
grant execute on function public.dist_period_summary(uuid,date,date) to authenticated;

comment on function public.dist_period_summary(uuid,date,date) is
  'Resumen agregado por rango de fechas para el reporte por período de Distribuidora Altiplánica: ventas, kilos, unidades, deuda a crédito vigente y serie diaria.';

commit;
