begin;

alter table public.dist_daily_closures
  add column if not exists observations text;

create or replace function public.dist_daily_expenses(target_unit uuid, target_date date)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null
    or not public.can_access_unit((select company_id from public.business_units where id=target_unit), target_unit)
    or not public.has_permission('finance.distribution.reports.view') then
    raise exception 'No autorizado para consultar gastos del cierre diario';
  end if;

  return (
    select coalesce(sum(l.amount), 0)
    from public.petty_cash_expense_lines l
    join public.petty_cash_reports r on r.id=l.petty_cash_report_id
    where l.business_unit_id=target_unit
      and l.expense_date=target_date
      and l.deleted_at is null
      and r.deleted_at is null
      and r.status not in ('cancelled','rejected')
  );
end
$$;

revoke all on function public.dist_daily_expenses(uuid,date) from public, anon;
grant execute on function public.dist_daily_expenses(uuid,date) to authenticated, service_role;

create or replace function public.dist_daily_summary(target_unit uuid,target_date date)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
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
     coalesce(sum(delivered_quantity*ice_weight_kg),0) ice_kg,
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
   'product_details',(select product_details from products)
 )
 from orders
$$;

comment on function public.dist_daily_summary(uuid,date) is
  'Resumen auditable del cierre DA: operación, productos, ventas, cobros efectivos y gastos de caja chica.';
comment on column public.dist_daily_closures.observations is
  'Observaciones operativas registradas al cerrar la jornada.';

commit;
