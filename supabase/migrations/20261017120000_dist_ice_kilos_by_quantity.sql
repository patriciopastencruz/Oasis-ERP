begin;

-- Los kilos de hielo se declaran directamente en kilos: la cantidad de un
-- producto como "Hielo cubo 2 kg" ya está en kilos y "2 kg" solo indica el
-- formato de venta. Los reportes multiplicaban la cantidad por ese peso y
-- duplicaban los kilos; ahora los kilos de hielo son la cantidad vendida de los
-- productos de hielo (cubo y frappé, cualquier formato).

CREATE OR REPLACE FUNCTION public.dist_daily_summary(target_unit uuid, target_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with orders as (
   select *
   from public.dist_orders
   where business_unit_id=target_unit
     and delivery_date=target_date
     and deleted_at is null
     and status not in('cancelled','voided')
 ),
 allocated_payments as (
   select coalesce(sum(a.amount),0) total
   from public.dist_payment_allocations a
   join public.dist_payments p on p.id=a.payment_id and p.status='confirmed'
   join orders o on o.id=a.order_id
 ),
 received_payments as (
   select
     coalesce(sum(p.amount) filter(where p.method='cash'),0) cash_received,
     coalesce(sum(p.amount) filter(where p.method='transfer'),0) transfer_received,
     coalesce(sum(p.amount) filter(where p.method='mixed'),0) mixed_received,
     coalesce(sum(p.amount),0) total_received
   from public.dist_payments p
   where p.business_unit_id=target_unit
     and p.status='confirmed'
     and (p.paid_at at time zone 'America/Santiago')::date=target_date
 ),
 product_rows as (
   select
     p.id,
     p.code,
     p.name,
     p.presentation,
     p.ice_weight_kg,
     coalesce(sum(l.planned_quantity),0) planned_quantity,
     coalesce(sum(case when o.status in('delivered','partially_delivered') then coalesce(l.delivered_quantity,l.planned_quantity) else 0 end),0) delivered_quantity,
     coalesce(sum(case when o.status in('delivered','partially_delivered') then coalesce(l.delivered_quantity,l.planned_quantity)*l.unit_price else 0 end),0) delivered_sales
   from public.dist_order_lines l
   join orders o on o.id=l.order_id
   join public.dist_products p on p.id=l.product_id
   group by p.id,p.code,p.name,p.presentation,p.ice_weight_kg
 ),
 products as (
   select
     coalesce(sum(delivered_quantity) filter(where ice_weight_kg>0),0) ice_kg,
     coalesce(jsonb_agg(jsonb_build_object(
       'id',id,
       'code',code,
       'name',name,
       'presentation',presentation,
       'planned_quantity',planned_quantity,
       'delivered_quantity',delivered_quantity,
       'delivered_sales',delivered_sales
     ) order by name),'[]'::jsonb) product_details
   from product_rows
 )
 select jsonb_build_object(
   'orders_total',count(*),
   'delivered',count(*) filter(where status='delivered'),
   'partial',count(*) filter(where status='partially_delivered'),
   'pending',count(*) filter(where status in('draft','scheduled','assigned','en_route','rescheduled')),
   'not_delivered',count(*) filter(where status='not_delivered'),
   'unassigned',count(*) filter(where driver_id is null),
   'route_sales',count(*) filter(where route_sale),
   'delivery_rate',case when count(*)=0 then 0 else round(100.0*(count(*) filter(where status in('delivered','partially_delivered')))/count(*),1) end,
   'planned_sales',coalesce(sum(total),0),
   'delivered_sales',coalesce(sum(total) filter(where status in('delivered','partially_delivered')),0),
   'cash',coalesce(sum(total) filter(where payment_method='cash'),0),
   'transfer',coalesce(sum(total) filter(where payment_method='transfer'),0),
   'credit',coalesce(sum(total) filter(where payment_condition='credit'),0),
   'collected',(select total from allocated_payments),
   'cash_received',(select cash_received from received_payments),
   'transfer_received',(select transfer_received from received_payments),
   'mixed_received',(select mixed_received from received_payments),
   'total_received',(select total_received from received_payments),
   'expense_total',case
     when public.has_permission('finance.distribution.reports.view')
       then public.dist_daily_expenses(target_unit,target_date)
     else 0
   end,
   'ice_kg',(select ice_kg from products),
   'water_units',coalesce((select sum(delivered_quantity) from product_rows where ice_weight_kg=0),0),
   'product_details',(select product_details from products),
   'driver_closures',public.dist_driver_closures_summary(target_unit,target_date)
 )
 from orders
$function$;

CREATE OR REPLACE FUNCTION public.dist_period_summary(target_unit uuid, date_from date, date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    'total_kg',coalesce((select sum(quantity) filter(where ice_weight_kg>0) from lines),0),
    'total_units',coalesce((select sum(quantity) from lines),0),
    'outstanding_credit',(select total from outstanding),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day,'sales',sales) order by day) from daily),'[]'::jsonb)
  )
 );
end
$function$;

create or replace function public.dist_closing_accumulated(target_unit uuid,target_date date)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare month_start date:=date_trunc('month',target_date)::date;
begin
 if not public.has_permission('finance.distribution.reports.view') then
  raise exception 'Sin autorizacion';
 end if;
 return (
  with days as (
    select generate_series(month_start,target_date,'1 day'::interval)::date as day
  ),
  delivered as (
    select o.id,o.delivery_date,o.total,o.payment_method,o.payment_condition
    from public.dist_orders o
    where o.business_unit_id=target_unit
      and o.delivery_date between month_start and target_date
      and o.deleted_at is null
      and o.status in('delivered','partially_delivered')
  ),
  lines as (
    select d.delivery_date as day,p.id as product_id,p.code,p.name,p.ice_weight_kg,
      coalesce(l.delivered_quantity,l.planned_quantity) as qty,
      (p.ice_weight_kg>0 and p.name ilike '%frapp%') as is_frappe
    from public.dist_order_lines l
    join delivered d on d.id=l.order_id
    join public.dist_products p on p.id=l.product_id
  ),
  daily as (
    select d.day,
      coalesce(sum(l.qty) filter(where l.ice_weight_kg>0 and not l.is_frappe),0) as kg_cube,
      coalesce(sum(l.qty) filter(where l.is_frappe),0) as kg_frappe,
      coalesce((select sum(o.total) from delivered o where o.delivery_date=d.day),0) as sales
    from days d left join lines l on l.day=d.day
    group by d.day
  ),
  by_product as (
    select product_id,code,name,ice_weight_kg,is_frappe,sum(qty) as units
    from lines
    group by product_id,code,name,ice_weight_kg,is_frappe
  )
  select jsonb_build_object(
    'month_start',month_start,
    'days',(target_date-month_start)+1,
    'income',coalesce((select sum(total) from delivered),0),
    'kg_cube',coalesce((select sum(kg_cube) from daily),0),
    'kg_frappe',coalesce((select sum(kg_frappe) from daily),0),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day,'kg_cube',kg_cube,'kg_frappe',kg_frappe,'sales',sales) order by day) from daily),'[]'::jsonb),
    'day',(
      select jsonb_build_object(
        'delivered',coalesce(sum(o.total),0),
        'cash',coalesce(sum(o.total) filter(where o.payment_method='cash' and o.payment_condition<>'credit'),0),
        'transfer',coalesce(sum(o.total) filter(where o.payment_method='transfer' and o.payment_condition<>'credit'),0),
        'credit',coalesce(sum(o.total) filter(where o.payment_condition='credit'),0)
      )
      from delivered o where o.delivery_date=target_date
    ),
    'by_product',coalesce((select jsonb_agg(jsonb_build_object('id',product_id,'code',code,'name',name,'ice_weight_kg',ice_weight_kg,'is_frappe',is_frappe,'units',units) order by name) from by_product),'[]'::jsonb)
  )
 );
end
$$;;

commit;
