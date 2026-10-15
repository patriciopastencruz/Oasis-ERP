begin;

-- Cierre diario de Distribuidora Altiplánica: gastos que declara quien cierra
-- la jornada y acumulado del mes a la fecha (kilos por día, ingreso acumulado
-- y unidades por producto) para los promedios y gráficos del reporte.
alter table public.dist_daily_closures
  add column if not exists declared_expenses numeric(14,2) not null default 0 check(declared_expenses>=0),
  add column if not exists expense_detail text;

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
    select o.id,o.delivery_date,o.total
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
      coalesce(sum(l.qty*l.ice_weight_kg) filter(where l.ice_weight_kg>0 and not l.is_frappe),0) as kg_cube,
      coalesce(sum(l.qty*l.ice_weight_kg) filter(where l.is_frappe),0) as kg_frappe,
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
    'by_product',coalesce((select jsonb_agg(jsonb_build_object('id',product_id,'code',code,'name',name,'ice_weight_kg',ice_weight_kg,'is_frappe',is_frappe,'units',units) order by name) from by_product),'[]'::jsonb)
  )
 );
end
$$;

revoke all on function public.dist_closing_accumulated(uuid,date) from public,anon;
grant execute on function public.dist_closing_accumulated(uuid,date) to authenticated;

comment on function public.dist_closing_accumulated(uuid,date) is
  'Acumulado del mes hasta la fecha para el cierre diario de Distribuidora Altiplánica: kilos de hielo cubo y frappé por día, ingreso acumulado y unidades por producto.';

commit;
