begin;

-- Ajuste de la detección de comprobantes repetidos. El «número de operación» que lee la IA muchas veces es el número de
-- cuenta de destino (la misma cuenta de la empresa en todas las transferencias), así que ya no se usa para comparar.
-- Un comprobante se considera repetido cuando es EXACTAMENTE el mismo (mismo archivo, o mismo monto, fecha y hora leídos)
-- y respalda pagos de reservas con fechas de llegada distintas, o cuando, siendo del mismo día, los pagos que lo usan suman
-- más de lo que el comprobante cubre (posible doble registro).
alter table public.lodging_payment_receipts add column ai_detected_time text
 check(ai_detected_time is null or ai_detected_time='' or ai_detected_time ~ '^[0-2][0-9]:[0-5][0-9]$');

-- '' = se intentó leer la hora y el comprobante no la muestra; null = aún no se ha intentado.
create index lodging_payment_receipts_content_idx on public.lodging_payment_receipts(ai_detected_amount,ai_detected_date,ai_detected_time)
 where deleted_at is null and ai_detected_time is not null and ai_detected_time<>'';

drop view if exists public.lodging_payment_keys;
create view public.lodging_payment_keys with (security_invoker=on) as
 select p.id pid,p.reservation_id rid,p.business_unit_id uid,p.paid_at,p.amount,'file'::text kind,r.file_sha256 k,r.ai_detected_amount::numeric receipt_amount,res.check_in
 from public.lodging_payment_receipts r join public.lodging_reservation_payments p on p.id=r.payment_id
 join public.lodging_reservations res on res.id=p.reservation_id
 where p.status='confirmed' and r.deleted_at is null
 union all
 select p.id,p.reservation_id,p.business_unit_id,p.paid_at,p.amount,'receipt',
  r.ai_detected_amount::bigint::text||'|'||r.ai_detected_date::text||'|'||r.ai_detected_time,r.ai_detected_amount::numeric,res.check_in
 from public.lodging_payment_receipts r join public.lodging_reservation_payments p on p.id=r.payment_id
 join public.lodging_reservations res on res.id=p.reservation_id
 where p.status='confirmed' and r.deleted_at is null and r.ai_detected_amount is not null and r.ai_detected_date is not null
  and r.ai_detected_time is not null and r.ai_detected_time<>'';

revoke all on public.lodging_payment_keys from public,anon,authenticated;
grant select on public.lodging_payment_keys to authenticated,service_role;

drop function if exists public.lodging_receipt_duplicates(uuid,date,date,uuid);
create function public.lodging_receipt_duplicates(target_unit uuid,from_date date,to_date date,target_reservation uuid default null)
returns table(payment_id uuid,reservation_id uuid,kind text,group_total numeric,receipt_amount numeric,dates_differ boolean,matches jsonb) language sql stable security invoker set search_path='' as $$
 with grp as (
  select kind,k,count(distinct pid) pays,count(distinct check_in) dates,
   (select sum(a) from (select distinct on (x.pid) x.pid,x.amount a from public.lodging_payment_keys x where x.kind=v.kind and x.k=v.k order by x.pid) s) total,
   max(receipt_amount) rec
  from public.lodging_payment_keys v where k is not null group by kind,k having count(distinct pid)>1
 ), flagged as (
  select * from grp where dates>1 or (rec is not null and total>rec*1.01+50)
 ), mine as (
  select o.*,f.total,f.rec,f.dates from public.lodging_payment_keys o
  join flagged f on f.kind=o.kind and f.k=o.k
  join public.lodging_reservations res on res.id=o.rid
  where o.uid=target_unit
    and (public.has_permission('lodging.receipts.review') or public.has_permission('lodging.closings.reports'))
    and ((target_reservation is not null and o.rid=target_reservation)
      or (target_reservation is null and res.check_in>=from_date and res.check_in<to_date))
 )
 select a.pid,a.rid,a.kind,max(a.total),max(a.rec),bool_or(a.dates>1),jsonb_agg(distinct jsonb_build_object(
   'payment_id',b.pid,'reservation_id',b.rid,'same_reservation',b.rid=a.rid,'paid_at',b.paid_at,'check_in',b.check_in,'amount',b.amount,
   'unit_code',bu.code,'room',rm.name,'guest',g.full_name))
 from mine a
 join public.lodging_payment_keys b on b.kind=a.kind and b.k=a.k and b.pid<>a.pid
 left join public.lodging_reservations rb on rb.id=b.rid
 left join public.lodging_rooms rm on rm.id=rb.room_id
 left join public.lodging_guests g on g.id=rb.guest_id
 left join public.business_units bu on bu.id=b.uid
 group by a.pid,a.rid,a.kind
$$;
revoke execute on function public.lodging_receipt_duplicates(uuid,date,date,uuid) from public,anon;
grant execute on function public.lodging_receipt_duplicates(uuid,date,date,uuid) to authenticated;

create or replace function public.lodging_notify_receipt_duplicate(target_receipt uuid) returns integer language plpgsql security definer set search_path='' as $$
declare r public.lodging_payment_receipts; p public.lodging_reservation_payments; res public.lodging_reservations;
 unit_name text; room_name text; hits int:=0; other_guest text; other_date date; differ boolean:=false;
begin
 select * into r from public.lodging_payment_receipts where id=target_receipt and deleted_at is null;
 if r.id is null then return 0; end if;
 select * into p from public.lodging_reservation_payments where id=r.payment_id and status='confirmed';
 if p.id is null then return 0; end if;
 select * into res from public.lodging_reservations where id=p.reservation_id;
 with mine as (select kind,k from public.lodging_payment_keys where pid=p.id and k is not null),
 grp as (
  select v.kind,v.k,count(distinct v.pid) pays,count(distinct v.check_in) dates,
   (select sum(a) from (select distinct on (x.pid) x.pid,x.amount a from public.lodging_payment_keys x where x.kind=v.kind and x.k=v.k order by x.pid) s) total,
   max(v.receipt_amount) rec
  from public.lodging_payment_keys v join mine m on m.kind=v.kind and m.k=v.k group by v.kind,v.k having count(distinct v.pid)>1
 ), flagged as (select * from grp where dates>1 or (rec is not null and total>rec*1.01+50))
 select count(distinct b.pid),max(g.full_name),max(rb.check_in),coalesce(bool_or(f.dates>1),false)
  into hits,other_guest,other_date,differ
 from flagged f join public.lodging_payment_keys b on b.kind=f.kind and b.k=f.k and b.pid<>p.id
 left join public.lodging_reservations rb on rb.id=b.rid
 left join public.lodging_guests g on g.id=rb.guest_id;
 if coalesce(hits,0)=0 then return 0; end if;
 if exists(select 1 from public.notifications where event_key='lodging.receipt.duplicate' and entity_id=r.id) then return hits; end if;
 select name into unit_name from public.business_units where id=r.business_unit_id;
 select name into room_name from public.lodging_rooms where id=res.room_id;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id)
 select r.company_id,r.business_unit_id,pr.id,'lodging.receipt.duplicate','Posible comprobante repetido',
  coalesce(unit_name,'Hostal')||': el comprobante de '||coalesce(room_name,'una habitación')||' ('||res.check_in||' al '||res.check_out||') es el mismo que el de otro pago'||
  case when differ then ' de una reserva con otras fechas' else '' end||
  coalesce(' (reserva de '||other_guest||coalesce(', llegada '||other_date,'')||')','')||'. Revísalo en el historial de reservas.',
  'lodging_receipt',r.id
 from public.profiles pr join public.user_business_units ub on ub.user_id=pr.id and ub.business_unit_id=r.business_unit_id
 where pr.active and pr.deleted_at is null and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=pr.role_id and k.key='lodging.receipts.review' and k.active);
 return hits;
end $$;
revoke execute on function public.lodging_notify_receipt_duplicate(uuid) from public,anon,authenticated;
grant execute on function public.lodging_notify_receipt_duplicate(uuid) to service_role;

commit;
