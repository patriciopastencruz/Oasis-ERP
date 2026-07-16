begin;

-- Cierre de caja simple que cada chofer declara al terminar su ruta: efectivo
-- que dice tener en mano, monto que quedó pendiente de cobro y observaciones
-- generales. Es un complemento al cierre formal del Administrador
-- (dist_daily_closures): queda disponible para contrastarlo antes de cerrar
-- la jornada, y se incorpora al snapshot auditable de dist_daily_summary.
create table public.dist_driver_closures(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 driver_id uuid not null references public.profiles(id),closure_date date not null,
 declared_cash numeric(14,2) not null default 0 check(declared_cash>=0),pending_amount numeric(14,2) not null default 0 check(pending_amount>=0),
 observations text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,driver_id,closure_date)
);
create trigger dist_driver_closures_updated before update on public.dist_driver_closures for each row execute function public.set_updated_at();
create trigger audit_dist_driver_closures after insert or update on public.dist_driver_closures for each row execute function public.audit_row_change();

alter table public.dist_driver_closures enable row level security;
create policy dist_driver_closures_read on public.dist_driver_closures for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.reports.view') or driver_id=(select auth.uid())));
create policy dist_driver_closures_insert on public.dist_driver_closures for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.driver') and driver_id=(select auth.uid()) and not public.dist_closed(business_unit_id,closure_date));
create policy dist_driver_closures_update on public.dist_driver_closures for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and driver_id=(select auth.uid()) and not public.dist_closed(business_unit_id,closure_date)) with check(public.can_access_unit(company_id,business_unit_id) and driver_id=(select auth.uid()) and not public.dist_closed(business_unit_id,closure_date));

grant select,insert,update on public.dist_driver_closures to authenticated,service_role;

-- dist_closed corría security invoker y dist_daily_closures solo se puede
-- leer con finance.distribution.reports.view: para un chofer (que no tiene
-- ese permiso) la RLS lo dejaba ciego a los cierres existentes, así que
-- dist_closed siempre le devolvía false aunque la jornada ya estuviera
-- cerrada. Eso rompía tanto el bloqueo de este cierre de caja como, ya
-- antes, el de "Fecha cerrada" en dist_create_order/dist_change_order_status
-- para cualquier chofer. Pasa a security definer, igual que el resto de los
-- helpers de solo-lectura de este módulo (dist_drivers, dist_daily_expenses).
create or replace function public.dist_closed(target_unit uuid,target_date date) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dist_daily_closures where business_unit_id=target_unit and closure_date=target_date and status='closed')
$$;
revoke all on function public.dist_closed(uuid,date) from public,anon;
grant execute on function public.dist_closed(uuid,date) to authenticated,service_role;

-- dist_daily_summary corre security invoker, y profiles solo deja ver el
-- propio registro (profiles_self_select) salvo administration.users.manage;
-- por eso el nombre del chofer se resuelve con este helper security definer
-- (mismo patrón que dist_daily_expenses), gateado por el mismo permiso de
-- reportes que ya protege el resto del resumen.
create or replace function public.dist_driver_closures_summary(target_unit uuid,target_date date)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'driver_id',dc.driver_id,
   'driver_name',trim(p.first_name||' '||p.last_name),
   'declared_cash',dc.declared_cash,
   'pending_amount',dc.pending_amount,
   'observations',dc.observations
 ) order by p.first_name,p.last_name),'[]'::jsonb)
 from public.dist_driver_closures dc
 join public.profiles p on p.id=dc.driver_id
 where dc.business_unit_id=target_unit
   and dc.closure_date=target_date
   and public.can_access_unit(dc.company_id,dc.business_unit_id)
   and public.has_permission('finance.distribution.reports.view')
$$;
revoke all on function public.dist_driver_closures_summary(uuid,date) from public,anon;
grant execute on function public.dist_driver_closures_summary(uuid,date) to authenticated,service_role;

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
   'product_details',(select product_details from products),
   'driver_closures',public.dist_driver_closures_summary(target_unit,target_date)
 )
 from orders
$$;

comment on table public.dist_driver_closures is
  'Cierre de caja simple declarado por cada chofer al terminar su ruta: efectivo en mano, monto pendiente de cobro y observaciones.';

commit;
