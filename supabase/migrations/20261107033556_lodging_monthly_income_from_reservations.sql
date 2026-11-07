begin;

-- El ingreso de hospedaje del cierre mensual pasa a ser la venta de las noches del mes: cada reserva vigente
-- aporta su monto por noche multiplicado por sus noches dentro del mes (hasta hoy en el mes en curso),
-- se haya registrado pago o no. Es la misma «Venta del mes» de los indicadores.
-- Los pagos contabilizados en el mes quedan como referencia para conciliar, junto con las reservas del mes
-- cuyo monto no coincide con lo pagado y los pagos que quedaron en reservas anuladas.
do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  ctes text := $a$ ), commissions as ($a$;
  income text := $a$   coalesce((select sum(amount) from pay),0)+coalesce((select sum(amount) from lines where section='income'),0)$a$;
  keys text := $a$  'commissions',jsonb_build_object($a$;
begin
  if (length(def) - length(replace(def, ctes, ''))) / length(ctes) <> 1
     or (length(def) - length(replace(def, income, ''))) / length(income) <> 1
     or (length(def) - length(replace(def, keys, ''))) / length(keys) <> 1 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar el ingreso del mes';
  end if;
  def := replace(def, ctes, $new$ ), stays as (
  -- Reservas vigentes con noches dentro del mes; en el mes en curso solo cuentan las noches hasta hoy.
  select s.id,s.room_id,s.guest_id,s.check_in,s.check_out,s.total_value,s.postpaid_company,
   s.total_value/greatest(1,s.check_out-s.check_in) as per_night,
   greatest(0,least(s.check_out,b.next_date,(now() at time zone 'America/Santiago')::date+1)-greatest(s.check_in,b.start_date)) as month_nights
  from public.lodging_reservations s,bounds b
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
   and s.check_in<b.next_date and s.check_out>b.start_date
 ), sales as (
  select round(coalesce(sum(per_night*month_nights),0)) as amount,coalesce(sum(month_nights),0)::int as nights,
   count(*) filter (where month_nights>0)::int as reservations
  from stays
 ), mismatches as (
  -- Reservas del mes cuyo monto no coincide con lo pagado (pagos de cualquier fecha).
  select s.id,rm.name as room,g.full_name as guest,s.check_in,s.check_out,s.total_value,s.postpaid_company,
   coalesce((select sum(case when p.type='refund' then -p.amount else p.amount end) from public.lodging_reservation_payments p
    where p.reservation_id=s.id and p.status='confirmed'),0) as paid
  from stays s
  join public.lodging_rooms rm on rm.id=s.room_id
  left join public.lodging_guests g on g.id=s.guest_id
  where s.month_nights>0
 ), cancelled_pay as (
  select count(*)::int as count,coalesce(sum(case when p.type='refund' then -p.amount else p.amount end),0) as amount
  from public.lodging_reservation_payments p,bounds b
  where p.business_unit_id=target_unit and p.status='confirmed'
   and (p.paid_at at time zone 'America/Santiago')::date>=b.start_date and (p.paid_at at time zone 'America/Santiago')::date<b.next_date
   and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id and r.status in('cancelled','conflict'))
 ), commissions as ($new$);
  def := replace(def, income, $new$   (select amount from sales)+coalesce((select sum(amount) from lines where section='income'),0)$new$);
  def := replace(def, keys, $new$  'sales',(select jsonb_build_object('total',amount,'nights',nights,'reservations',reservations) from sales),
  'reconciliation',jsonb_build_object(
   'mismatches',coalesce((select jsonb_agg(jsonb_build_object('id',id,'room',room,'guest',guest,'check_in',check_in,'check_out',check_out,
     'total_value',total_value,'paid',paid,'difference',total_value-paid,'postpaid_company',postpaid_company) order by check_in,room)
    from mismatches where paid<>total_value),'[]'::jsonb),
   'cancelled_payments',(select jsonb_build_object('count',count,'amount',amount) from cancelled_pay)),
$new$ || keys);
  execute def;
end $$;

-- Los cierres mensuales en preparación recalculan su ingreso con la regla nueva.
select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';

commit;
