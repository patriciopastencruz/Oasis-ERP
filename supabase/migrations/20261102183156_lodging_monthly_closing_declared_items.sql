begin;

-- Cada gasto declarado se detalla en el estado de resultados con su propio nombre (la descripción con que se ingresó)
-- en vez de un resumen «Gastos declarados (n)». Los totales por categoría no cambian.
create or replace function public.lodging_monthly_summary_internal(target_unit uuid,target_period date) returns jsonb language sql stable security definer set search_path='' as $$
 with bounds as (
  select date_trunc('month',target_period)::date as start_date,(date_trunc('month',target_period)+interval '1 month')::date as next_date
 ), closing as (
  select c.* from public.lodging_monthly_closings c,bounds b where c.business_unit_id=target_unit and c.period=b.start_date
 ), pay as (
  select p.payment_method,case when p.type='refund' then -p.amount else p.amount end as amount
  from public.lodging_reservation_payments p,bounds b
  where p.business_unit_id=target_unit and p.status='confirmed'
   and (p.paid_at at time zone 'America/Santiago')::date>=b.start_date and (p.paid_at at time zone 'America/Santiago')::date<b.next_date
 ), commissions as (
  select coalesce(sum(r.commission),0) as amount from public.lodging_reservations r,bounds b
  where r.business_unit_id=target_unit and r.status not in('cancelled','conflict') and r.origin<>'maintenance'
   and r.check_in>=b.start_date and r.check_in<b.next_date
 ), daily as (
  select e.category_id,coalesce(fc.name,'Gastos diarios sin categoría') as name,coalesce(fc.section,'variable') as section,
   sum(e.amount) as amount,count(*)::int as lines
  from public.lodging_daily_closing_expenses e
  join public.lodging_daily_closings d on d.id=e.closing_id and d.status='issued'
  left join public.lodging_finance_categories fc on fc.id=e.category_id
  cross join bounds b
  where e.business_unit_id=target_unit and e.deleted_at is null and d.closing_date>=b.start_date and d.closing_date<b.next_date
  group by 1,2,3
 ), declared as (
  -- Gastos declarados en el módulo Gastos (no anulados): la fuente oficial de los gastos del mes.
  select e.category_id,fc.name,fc.section,sum(e.amount) as amount,count(*)::int as lines,
   jsonb_agg(jsonb_build_object('date',e.expense_date,'description',e.description,'supplier',e.supplier,'amount',e.amount) order by e.expense_date,e.created_at) as items
  from public.lodging_expenses e
  join public.lodging_finance_categories fc on fc.id=e.category_id
  cross join bounds b
  where e.business_unit_id=target_unit and e.voided_at is null and e.expense_date>=b.start_date and e.expense_date<b.next_date
  group by 1,2,3
 ), expense_source as (
  -- Si el hostal declaró gastos en el mes, esos son los gastos; los de los cierres diarios quedan solo como referencia
  -- para conciliar y nunca se suman. Sin gastos declarados (hostal que aún no usa el módulo) se usan los de los cierres diarios.
  select exists(select 1 from declared) as use_declared
 ), counted as (
  select section,amount from declared
  union all
  select section,amount from daily where not (select use_declared from expense_source)
 ), lines as (
  select l.id,l.category_id,fc.name as category,fc.section,l.description,l.amount,l.payer,l.payment_status
  from public.lodging_monthly_closing_lines l join closing c on c.id=l.closing_id
  join public.lodging_finance_categories fc on fc.id=l.category_id
  where l.deleted_at is null
 ), commission_category as (
  select id,name from public.lodging_finance_categories where business_unit_id=target_unit and name='Comisiones plataformas' limit 1
 ), totals as (
  select
   coalesce((select sum(amount) from pay),0)+coalesce((select sum(amount) from lines where section='income'),0)+coalesce((select sum(amount) from counted where section='income'),0) as income,
   coalesce((select sum(amount) from lines where section='fixed'),0)+coalesce((select sum(amount) from counted where section='fixed'),0) as fixed,
   coalesce((select sum(amount) from lines where section='variable'),0)+coalesce((select sum(amount) from counted where section='variable'),0)+(select amount from commissions) as variable,
   coalesce((select sum(amount) from lines where section='investment'),0)+coalesce((select sum(amount) from counted where section='investment'),0) as investment,
   coalesce((select sum(amount) from lines where section='withdrawal'),0)+coalesce((select sum(amount) from counted where section='withdrawal'),0) as withdrawal,
   coalesce((select sum(amount) from lines where section='other'),0)+coalesce((select sum(amount) from counted where section='other'),0) as other
 )
 select jsonb_build_object(
  'period',(select start_date from bounds),
  'days',((select next_date from bounds)-(select start_date from bounds)),
  'lodging_income',jsonb_build_object(
   'total',coalesce((select sum(amount) from pay),0),
   'by_method',coalesce((select jsonb_object_agg(payment_method,amount) from (select payment_method,sum(amount) as amount from pay group by 1) m),'{}'::jsonb)),
  'commissions',jsonb_build_object('amount',(select amount from commissions),'category_id',(select id from commission_category)),
  'daily_expenses',coalesce((select jsonb_agg(jsonb_build_object('category_id',category_id,'name',name,'section',section,'amount',amount,'lines',lines) order by amount desc) from daily),'[]'::jsonb),
  'declared_expenses',coalesce((select jsonb_agg(jsonb_build_object('category_id',category_id,'name',name,'section',section,'amount',amount,'lines',lines,'items',items) order by amount desc) from declared),'[]'::jsonb),
  'expenses_source',case when (select use_declared from expense_source) then 'declared' else 'daily' end,
  'daily_reference',jsonb_build_object('amount',coalesce((select sum(amount) from daily),0),'lines',coalesce((select sum(lines) from daily),0)),
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'category',category,'section',section,'description',description,'amount',amount,'payer',payer,'payment_status',payment_status) order by section,category,description) from lines),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'section',section,'name',name,'sort_order',sort_order,'active',active) order by sort_order,name)
   from public.lodging_finance_categories where business_unit_id=target_unit),'[]'::jsonb),
  'totals',jsonb_build_object('income',t.income,'fixed',t.fixed,'variable',t.variable,'investment',t.investment,'withdrawal',t.withdrawal,'other',t.other,
   'costs',t.fixed+t.variable,'profit',t.income-t.fixed-t.variable-t.investment-t.withdrawal-t.other),
  'pending',jsonb_build_object('count',(select count(*) from lines where payment_status='pendiente'),'amount',coalesce((select sum(amount) from lines where payment_status='pendiente'),0)),
  'daily_closings',jsonb_build_object(
   'issued',(select count(*) from public.lodging_daily_closings d,bounds b where d.business_unit_id=target_unit and d.status='issued' and d.closing_date>=b.start_date and d.closing_date<b.next_date))
 ) from totals t
$$;
revoke execute on function public.lodging_monthly_summary_internal(uuid,date) from public,anon,authenticated;

-- Los borradores toman los nuevos gastos de inmediato.
select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';

commit;
