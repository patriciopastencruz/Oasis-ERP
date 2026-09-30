begin;

-- Cierre diario: más contexto en el reporte ejecutivo. Se agregan al mismo
-- JSON de indicadores (que se guarda en cada cierre al emitirlo):
--  · by_origin: reservas de la noche por origen (Booking, Airbnb, directa...).
--  · availability_10d: habitaciones ocupadas y disponibles de los últimos 10 días.
--  · month_by_type: venta promedio por habitación ocupada, acumulada del mes, por tipo.
--  · cleaning: tiempo promedio de aseo del día y del mes (portal operativo).
-- La función original se conserva con otro nombre y la nueva le suma los
-- bloques, así todo lo que ya la usa recibe los datos sin otros cambios.

alter function public.lodging_closing_metrics_internal(uuid,date) rename to lodging_closing_base_metrics_internal;
revoke execute on function public.lodging_closing_base_metrics_internal(uuid,date) from public,anon,authenticated;

create or replace function public.lodging_closing_extras_internal(target_unit uuid,target_date date) returns jsonb language sql stable security definer set search_path='' as $$
 with rooms as (
  select r.id,btrim(r.room_type) as room_type from public.lodging_rooms r
  where r.business_unit_id=target_unit and r.active and r.status not in('out_of_service','maintenance')
 ), res as (
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
 ), stays as (
  select * from res where check_in<=target_date and check_out>target_date
 ), month_nights as (
  -- Cada noche del mes (hasta la fecha del cierre) con la venta de esa noche.
  select n.night,s.room_id,s.room_type,s.total_value/nullif(s.nights,0) as night_value
  from res s cross join lateral generate_series(greatest(s.check_in,date_trunc('month',target_date)::date),least(s.check_out-1,target_date),interval '1 day') as n(night)
  where s.check_in<=target_date and s.check_out>date_trunc('month',target_date)::date
 ), cleaning as (
  select t.duration_minutes,(t.completed_at at time zone 'America/Santiago')::date as day from public.lodging_housekeeping_tasks t
  where t.business_unit_id=target_unit and t.status='completed' and t.duration_minutes is not null
   and (t.completed_at at time zone 'America/Santiago')::date between date_trunc('month',target_date)::date and target_date
 )
 select jsonb_build_object(
  'by_origin',coalesce((select jsonb_agg(x order by x.revenue desc,x.origin) from (
    select o.origin,
     (select count(distinct room_id) from stays s where s.origin=o.origin)::int as rooms,
     coalesce(round((select sum(total_value/nullif(nights,0)) from stays s where s.origin=o.origin)),0) as revenue,
     (select count(*) from res s where s.origin=o.origin and s.check_in=target_date)::int as arrivals
    from (select distinct origin from stays union select distinct origin from res where check_in=target_date) o) x),'[]'::jsonb),
  'availability_10d',(select jsonb_agg(jsonb_build_object('date',d::date,'total',(select count(*) from rooms),
     'occupied',(select count(distinct s.room_id) from res s where s.check_in<=d::date and s.check_out>d::date)) order by d)
   from generate_series(target_date-9,target_date,interval '1 day') d),
  'month_by_type',coalesce((select jsonb_agg(x order by x.room_type) from (
    select room_type,count(*)::int as nights,round(sum(night_value)/nullif(count(*),0)) as average_rate
    from month_nights group by room_type) x),'[]'::jsonb),
  'cleaning',jsonb_build_object(
   'day_count',(select count(*) from cleaning where day=target_date),
   'day_avg_minutes',(select round(avg(duration_minutes)) from cleaning where day=target_date),
   'month_count',(select count(*) from cleaning),
   'month_avg_minutes',(select round(avg(duration_minutes)) from cleaning))
 )
$$;
revoke execute on function public.lodging_closing_extras_internal(uuid,date) from public,anon,authenticated;

create or replace function public.lodging_closing_metrics_internal(target_unit uuid,target_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select public.lodging_closing_base_metrics_internal(target_unit,target_date) || public.lodging_closing_extras_internal(target_unit,target_date)
$$;
revoke execute on function public.lodging_closing_metrics_internal(uuid,date) from public,anon,authenticated;

commit;
