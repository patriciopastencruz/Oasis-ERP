begin;

-- El cierre de un día pasado debe contar las habitaciones como estaban ese día, no como están hoy.
-- Antes dejaba fuera toda habitación que hoy está fuera de servicio o en mantención, aunque ese día
-- haya estado en servicio y con una noche vendida (ocupación y venta del cierre salían menores que en
-- el reporte mensual). Ahora una habitación cuenta ese día si no estaba fuera de servicio o si tiene
-- una noche vendida, igual que el reporte. Solo cambia el cálculo: no modifica cierres ya guardados;
-- se vuelven a calcular con lodging_apply_closing_snapshot.

-- ¿La habitación estaba fuera de servicio (o en mantención) ese día? Mismo criterio que serviceGaps():
-- cuenta desde el día en que salió de servicio (incluido) hasta el día en que volvió (excluido).
create or replace function public.lodging_room_out_of_service_on(target_room uuid,target_day date) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
  -- Último cambio hacia o desde "fuera de servicio" hasta ese día.
  (select e.to_status in('out_of_service','maintenance') from public.lodging_room_status_events e
   where e.room_id=target_room and (e.to_status in('out_of_service','maintenance') or e.from_status in('out_of_service','maintenance'))
    and (e.created_at at time zone 'America/Santiago')::date<=target_day
   order by e.created_at desc limit 1),
  -- Sin cambios hasta ese día: ya estaba fuera de servicio si el primer cambio registrado sale de ese estado.
  (select e.from_status in('out_of_service','maintenance') from public.lodging_room_status_events e
   where e.room_id=target_room and (e.to_status in('out_of_service','maintenance') or e.from_status in('out_of_service','maintenance'))
   order by e.created_at limit 1),
  -- Sin historial: se usa la fecha de la última modificación si hoy está fuera de servicio.
  (select r.status in('out_of_service','maintenance') and (r.updated_at at time zone 'America/Santiago')::date<=target_day from public.lodging_rooms r where r.id=target_room),
  false)
$$;
revoke execute on function public.lodging_room_out_of_service_on(uuid,date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.lodging_closing_base_metrics_internal(target_unit uuid, target_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with rooms as (
  select r.id,r.name,btrim(r.room_type) as room_type,r.display_order from public.lodging_rooms r
  where r.business_unit_id=target_unit and r.active
   and (not public.lodging_room_out_of_service_on(r.id,target_date)
    or exists(select 1 from public.lodging_reservations s where s.room_id=r.id and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
     and s.check_in<=target_date and s.check_out>target_date))
 ), stays as (
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
   and s.check_in<=target_date and s.check_out>target_date
 ), day_payments as (
  select p.*,case when p.type='refund' then -p.amount else p.amount end as net_amount
  from public.lodging_reservation_payments p
  where p.business_unit_id=target_unit and p.status='confirmed'
   and (p.paid_at at time zone 'America/Santiago')::date=target_date
 ), paid as (
  select p.reservation_id,sum(case when p.type='refund' then -p.amount else p.amount end) as amount
  from public.lodging_reservation_payments p where p.business_unit_id=target_unit and p.status='confirmed' group by 1
 ), pending as (
  select s.id,rm.name as room_name,g.full_name as guest_name,s.check_in,s.check_out,s.total_value,
   coalesce(pd.amount,0) as paid,s.total_value-coalesce(pd.amount,0) as balance,s.postpaid_company
  from public.lodging_reservations s join public.lodging_rooms rm on rm.id=s.room_id
  left join public.lodging_guests g on g.id=s.guest_id left join paid pd on pd.reservation_id=s.id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
   and s.check_in<=target_date and s.check_out>=target_date and s.total_value-coalesce(pd.amount,0)>0
 ), counts as (
  select (select count(*) from rooms)::int as total_rooms,
   (select count(*) from stays)::int as occupied_rooms,
   coalesce((select sum(total_value/nullif(nights,0)) from stays),0) as day_revenue
 )
 select jsonb_build_object(
  'date',target_date,
  'total_rooms',c.total_rooms,
  'occupied_rooms',c.occupied_rooms,
  'available_rooms',greatest(c.total_rooms-c.occupied_rooms,0),
  'occupancy_pct',case when c.total_rooms>0 then round(c.occupied_rooms*100.0/c.total_rooms,2) else 0 end,
  'day_revenue',round(c.day_revenue),
  'average_rate',case when c.occupied_rooms>0 then round(c.day_revenue/c.occupied_rooms) else 0 end,
  'guests',coalesce((select sum(guest_count) from stays),0),
  -- Reventas: habitaciones con más de una reserva activa la misma noche (la
  -- original quedó pagada y no llegó, y se volvió a vender).
  'resold_rooms',((select count(*) from stays)-(select count(distinct room_id) from stays))::int,
  -- No-show (sin pago) que debían llegar este día.
  'no_shows',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.no_show and s.check_in=target_date),
  'arrivals',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance' and s.check_in=target_date),
  'departures',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance' and s.check_out=target_date),
  'reservations_without_price',(select count(*) from stays where total_value<=0),
  'by_type',coalesce((
   select jsonb_agg(t order by t.first_order) from (
    select rm.room_type,min(rm.display_order) as first_order,count(*)::int as total,
     (select count(*) from stays s where s.room_type=rm.room_type)::int as occupied,
     coalesce(round((select sum(s.total_value/nullif(s.nights,0)) from stays s where s.room_type=rm.room_type)
      /nullif((select count(*) from stays s where s.room_type=rm.room_type),0)),0) as average_rate
    from rooms rm group by rm.room_type
   ) t),'[]'::jsonb),
  'payments_by_method',jsonb_build_object(
   'cash',coalesce((select sum(net_amount) from day_payments where payment_method='cash'),0),
   'transfer',coalesce((select sum(net_amount) from day_payments where payment_method='transfer'),0),
   'card',coalesce((select sum(net_amount) from day_payments where payment_method='card'),0),
   'airbnb',coalesce((select sum(net_amount) from day_payments where payment_method='airbnb'),0),
   'booking',coalesce((select sum(net_amount) from day_payments where payment_method='booking'),0),
   'company',coalesce((select sum(net_amount) from day_payments where payment_method='company'),0),
   'other',coalesce((select sum(net_amount) from day_payments where payment_method='other'),0)),
  'total_received',coalesce((select sum(net_amount) from day_payments),0),
  'payments',coalesce((
   select jsonb_agg(jsonb_build_object('room',rm.name,'guest',g.full_name,'method',p.payment_method,'type',p.type,'amount',p.net_amount,'paid_at',p.paid_at) order by p.paid_at)
   from day_payments p join public.lodging_reservations s on s.id=p.reservation_id join public.lodging_rooms rm on rm.id=s.room_id
   left join public.lodging_guests g on g.id=s.guest_id),'[]'::jsonb),
  'pending_amount',coalesce((select sum(balance) from pending),0),
  'pending',coalesce((select jsonb_agg(jsonb_build_object('room',room_name,'guest',guest_name,'check_in',check_in,'check_out',check_out,'total',total_value,'paid',paid,'balance',balance,'postpaid_company',postpaid_company) order by room_name) from pending),'[]'::jsonb)
 ) from counts c
$function$;

CREATE OR REPLACE FUNCTION public.lodging_closing_extras_internal(target_unit uuid, target_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with rooms as (
  select r.id,btrim(r.room_type) as room_type from public.lodging_rooms r
  where r.business_unit_id=target_unit and r.active
   and (not public.lodging_room_out_of_service_on(r.id,target_date)
    or exists(select 1 from public.lodging_reservations s where s.room_id=r.id and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
     and s.check_in<=target_date and s.check_out>target_date))
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
     (select count(*) from stays s where s.origin=o.origin)::int as rooms,
     coalesce(round((select sum(total_value/nullif(nights,0)) from stays s where s.origin=o.origin)),0) as revenue,
     (select count(*) from res s where s.origin=o.origin and s.check_in=target_date)::int as arrivals
    from (select distinct origin from stays union select distinct origin from res where check_in=target_date) o) x),'[]'::jsonb),
  'availability_10d',(select jsonb_agg(jsonb_build_object('date',d::date,'total',(select count(*) from rooms),
     'occupied',(select count(*) from res s where s.check_in<=d::date and s.check_out>d::date)) order by d)
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
$function$;

commit;
