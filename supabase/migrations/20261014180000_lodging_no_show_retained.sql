begin;

-- No-show con pago retenido (Airbnb/Booking/directas): la persona pagó, avisó
-- que no llegaba y por política no se reembolsa; la habitación se puede volver
-- a vender. La reserva queda ANULADA (libera la habitación y no afecta la
-- disponibilidad ni el calendario) pero con no_show_retained=true: su noche
-- cuenta como ocupada y su venta se suma en los indicadores del cierre y de los
-- reportes. Si la habitación se revende, la ocupación del día puede superar el
-- 100%, a propósito, para el promedio. Los pagos ya se contaban por fecha de pago.

alter table public.lodging_reservations
  add column no_show_retained boolean not null default false,
  add column no_show_at timestamptz,
  add column no_show_by uuid references public.profiles(id);
create index lodging_reservations_no_show_idx on public.lodging_reservations(business_unit_id,check_in) where no_show_retained;

CREATE OR REPLACE FUNCTION public.lodging_closing_base_metrics_internal(target_unit uuid, target_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with rooms as (
  select r.id,r.name,btrim(r.room_type) as room_type,r.display_order from public.lodging_rooms r
  where r.business_unit_id=target_unit and r.active and r.status not in('out_of_service','maintenance')
 ), stays as (
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
   and s.check_in<=target_date and s.check_out>target_date
 ), noshow as (
  -- No-show con pago retenido: la reserva queda anulada (libera la habitación)
  -- pero su noche cuenta como ocupada y su venta se suma, aunque la habitación
  -- se haya vuelto a vender. Por eso la ocupación puede superar el 100%.
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status='cancelled' and s.no_show_retained and s.origin<>'maintenance'
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
   ((select count(distinct room_id) from stays)+(select count(*) from noshow))::int as occupied_rooms,
   coalesce((select sum(total_value/nullif(nights,0)) from stays),0)+coalesce((select sum(total_value/nullif(nights,0)) from noshow),0) as day_revenue
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
  'no_show_rooms',(select count(*) from noshow)::int,
  'no_show_revenue',round(coalesce((select sum(total_value/nullif(nights,0)) from noshow),0)),
  'arrivals',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance' and s.check_in=target_date),
  'departures',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance' and s.check_out=target_date),
  'reservations_without_price',(select count(*) from stays where total_value<=0),
  'by_type',coalesce((
   select jsonb_agg(t order by t.first_order) from (
    select rm.room_type,min(rm.display_order) as first_order,count(*)::int as total,
     ((select count(distinct s.room_id) from stays s where s.room_type=rm.room_type)+(select count(*) from noshow s where s.room_type=rm.room_type))::int as occupied,
     coalesce(round(((select coalesce(sum(s.total_value/nullif(s.nights,0)),0) from stays s where s.room_type=rm.room_type)+(select coalesce(sum(s.total_value/nullif(s.nights,0)),0) from noshow s where s.room_type=rm.room_type))
      /nullif((select count(distinct s.room_id) from stays s where s.room_type=rm.room_type)+(select count(*) from noshow s where s.room_type=rm.room_type),0)),0) as average_rate
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
  where r.business_unit_id=target_unit and r.active and r.status not in('out_of_service','maintenance')
 ), res as (
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
 ), res_ns as (
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status='cancelled' and s.no_show_retained and s.origin<>'maintenance'
 ), stays as (
  select * from res where check_in<=target_date and check_out>target_date
 ), stays_ns as (
  select * from res_ns where check_in<=target_date and check_out>target_date
 ), month_nights as (
  -- Cada noche del mes (hasta la fecha del cierre) con la venta de esa noche.
  select n.night,s.room_id,s.room_type,s.total_value/nullif(s.nights,0) as night_value
  from (select * from res union all select * from res_ns) s cross join lateral generate_series(greatest(s.check_in,date_trunc('month',target_date)::date),least(s.check_out-1,target_date),interval '1 day') as n(night)
  where s.check_in<=target_date and s.check_out>date_trunc('month',target_date)::date
 ), cleaning as (
  select t.duration_minutes,(t.completed_at at time zone 'America/Santiago')::date as day from public.lodging_housekeeping_tasks t
  where t.business_unit_id=target_unit and t.status='completed' and t.duration_minutes is not null
   and (t.completed_at at time zone 'America/Santiago')::date between date_trunc('month',target_date)::date and target_date
 )
 select jsonb_build_object(
  'by_origin',coalesce((select jsonb_agg(x order by x.revenue desc,x.origin) from (
    select o.origin,
     ((select count(distinct room_id) from stays s where s.origin=o.origin)+(select count(*) from stays_ns s where s.origin=o.origin))::int as rooms,
     coalesce(round((select coalesce(sum(total_value/nullif(nights,0)),0) from stays s where s.origin=o.origin)+(select coalesce(sum(total_value/nullif(nights,0)),0) from stays_ns s where s.origin=o.origin)),0) as revenue,
     (select count(*) from res s where s.origin=o.origin and s.check_in=target_date)::int as arrivals
    from (select distinct origin from stays union select distinct origin from stays_ns union select distinct origin from res where check_in=target_date) o) x),'[]'::jsonb),
  'availability_10d',(select jsonb_agg(jsonb_build_object('date',d::date,'total',(select count(*) from rooms),
     'occupied',(select count(distinct s.room_id) from res s where s.check_in<=d::date and s.check_out>d::date)+(select count(*) from res_ns s where s.check_in<=d::date and s.check_out>d::date)) order by d)
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

-- ---------------------------------------------------------------------------
-- Marcar una reserva como no-show con pago retenido.
create or replace function public.lodging_mark_no_show(target_reservation uuid,note text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.lodging_reservations; v_note text:=btrim(coalesce(note,'')); room_name text;
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 if me is null or not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=target_reservation for update;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if r.status not in('pending','confirmed') then raise exception 'Solo se puede marcar no-show una reserva que aun no llega'; end if;
 if r.check_in>today then raise exception 'El no-show solo se marca desde el dia de llegada'; end if;
 if char_length(v_note)<5 then raise exception 'Indica el motivo (ej. avisó que no llegaría)'; end if;
 update public.lodging_reservations set status='cancelled',cancelled_at=now(),cancellation_reason='No-show, pago retenido: '||v_note,
  no_show_retained=true,no_show_at=now(),no_show_by=me where id=r.id;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(r.company_id,r.business_unit_id,me,'mark_no_show','lodging_reservations',r.id,
  jsonb_build_object('status',r.status,'check_in',r.check_in,'check_out',r.check_out,'total_value',r.total_value,'paid',public.lodging_reservation_paid(r.id)),
  jsonb_build_object('status','cancelled','no_show_retained',true,'note',v_note));
 -- Aviso (solo en la app) a quienes administran la unidad.
 select name into room_name from public.lodging_rooms where id=r.room_id;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select r.company_id,r.business_unit_id,p.id,'lodging.no_show.marked','No-show con pago retenido',
  'Se marcó no-show la reserva de '||coalesce(room_name,'una habitación')||' del '||r.check_in||' al '||r.check_out||'. Motivo: '||left(v_note,160),
  'lodging_reservation',r.id,me
 from public.profiles p join public.user_business_units u on u.user_id=p.id and u.business_unit_id=r.business_unit_id
 where p.active and p.deleted_at is null and p.id<>me and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=p.role_id and k.key='lodging.reservations.cancel_approve' and k.active);
end $$;
revoke execute on function public.lodging_mark_no_show(uuid,text) from public,anon;
grant execute on function public.lodging_mark_no_show(uuid,text) to authenticated;

-- Quitar la retención: la reserva queda como una anulación normal (no cuenta
-- en ocupación ni en venta). Solo quien aprueba anulaciones.
create or replace function public.lodging_unmark_no_show(target_reservation uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.lodging_reservations;
begin
 if me is null or not public.has_permission('lodging.reservations.cancel_approve') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=target_reservation for update;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if not r.no_show_retained then raise exception 'La reserva no esta marcada como no-show'; end if;
 update public.lodging_reservations set no_show_retained=false,cancellation_reason=coalesce(cancellation_reason,'')||' (retencion quitada)' where id=r.id;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(r.company_id,r.business_unit_id,me,'unmark_no_show','lodging_reservations',r.id,jsonb_build_object('no_show_retained',true),jsonb_build_object('no_show_retained',false));
end $$;
revoke execute on function public.lodging_unmark_no_show(uuid) from public,anon;
grant execute on function public.lodging_unmark_no_show(uuid) to authenticated;

commit;
