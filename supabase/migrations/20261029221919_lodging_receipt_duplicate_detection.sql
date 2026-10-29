begin;

-- Detección de comprobantes repetidos: el mismo número de operación (el que digita recepción o el que lee la IA)
-- o el mismo archivo (huella SHA-256) en más de un pago confirmado. Un mismo comprobante puede respaldar varias
-- reservas si el total que cubre alcanza: solo se marca cuando los pagos que lo citan suman MÁS que el monto del
-- comprobante (o no se puede comprobar), que es lo que pasa cuando se reutiliza un comprobante para cobrar dos veces.
alter table public.lodging_payment_receipts add column file_sha256 text check(file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');

-- Número de operación normalizado: sin espacios ni signos, en minúsculas y sin ceros a la izquierda; null si es muy corto para ser fiable.
create or replace function public.lodging_op_key(op text) returns text language sql immutable set search_path='' as $$
 select nullif(case when char_length(regexp_replace(lower(coalesce(op,'')),'[^a-z0-9]','','g'))>=6
  then ltrim(regexp_replace(lower(op),'[^a-z0-9]','','g'),'0') end,'')
$$;

create index lodging_payment_receipts_sha_idx on public.lodging_payment_receipts(file_sha256) where file_sha256 is not null and deleted_at is null;
create index lodging_payment_receipts_opkey_idx on public.lodging_payment_receipts(public.lodging_op_key(ai_operation_number)) where ai_operation_number is not null and deleted_at is null;
create index lodging_reservation_payments_opkey_idx on public.lodging_reservation_payments(public.lodging_op_key(operation_number)) where operation_number is not null and status='confirmed';

-- Una fila por cada «huella» de un pago confirmado: número digitado, número leído por la IA y archivo.
create or replace view public.lodging_payment_keys with (security_invoker=on) as
 select p.id pid,p.reservation_id rid,p.business_unit_id uid,p.paid_at,p.amount,'op'::text kind,public.lodging_op_key(p.operation_number) k,null::numeric receipt_amount
 from public.lodging_reservation_payments p where p.status='confirmed'
 union all
 select p.id,p.reservation_id,p.business_unit_id,p.paid_at,p.amount,'op',public.lodging_op_key(r.ai_operation_number),r.ai_detected_amount
 from public.lodging_payment_receipts r join public.lodging_reservation_payments p on p.id=r.payment_id
 where p.status='confirmed' and r.deleted_at is null
 union all
 select p.id,p.reservation_id,p.business_unit_id,p.paid_at,p.amount,'file',r.file_sha256,r.ai_detected_amount
 from public.lodging_payment_receipts r join public.lodging_reservation_payments p on p.id=r.payment_id
 where p.status='confirmed' and r.deleted_at is null;
revoke all on public.lodging_payment_keys from public,anon,authenticated;
grant select on public.lodging_payment_keys to authenticated,service_role;

-- Repetidos de las reservas de un hostal con llegada en el rango (o de una sola reserva). Respeta RLS: solo ve lo que el usuario puede ver.
create or replace function public.lodging_receipt_duplicates(target_unit uuid,from_date date,to_date date,target_reservation uuid default null)
returns table(payment_id uuid,reservation_id uuid,kind text,group_total numeric,receipt_amount numeric,matches jsonb) language sql stable security invoker set search_path='' as $$
 with grp as (
  select kind,k,count(distinct pid) pays,
   (select sum(a) from (select distinct on (x.pid) x.pid,x.amount a from public.lodging_payment_keys x where x.kind=v.kind and x.k=v.k order by x.pid) s) total,
   max(receipt_amount) rec
  from public.lodging_payment_keys v where k is not null group by kind,k having count(distinct pid)>1
 ), flagged as (
  select * from grp where rec is null or total>rec*1.01+50
 ), mine as (
  select o.*,f.total,f.rec from public.lodging_payment_keys o
  join flagged f on f.kind=o.kind and f.k=o.k
  join public.lodging_reservations res on res.id=o.rid
  where o.uid=target_unit
    and (public.has_permission('lodging.receipts.review') or public.has_permission('lodging.closings.reports'))
    and ((target_reservation is not null and o.rid=target_reservation)
      or (target_reservation is null and res.check_in>=from_date and res.check_in<to_date))
 )
 select a.pid,a.rid,a.kind,max(a.total),max(a.rec),jsonb_agg(distinct jsonb_build_object(
   'payment_id',b.pid,'reservation_id',b.rid,'same_reservation',b.rid=a.rid,'paid_at',b.paid_at,'amount',b.amount,
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

-- Aviso a quienes revisan comprobantes del hostal cuando un comprobante recién leído queda repetido (con la misma regla de arriba).
-- Lo llama el servidor al terminar la lectura con IA; no se expone a usuarios.
create or replace function public.lodging_notify_receipt_duplicate(target_receipt uuid) returns integer language plpgsql security definer set search_path='' as $$
declare r public.lodging_payment_receipts; p public.lodging_reservation_payments; res public.lodging_reservations;
 unit_name text; room_name text; hits int:=0; other_guest text; other_date date; is_file boolean:=false;
begin
 select * into r from public.lodging_payment_receipts where id=target_receipt and deleted_at is null;
 if r.id is null then return 0; end if;
 select * into p from public.lodging_reservation_payments where id=r.payment_id and status='confirmed';
 if p.id is null then return 0; end if;
 select * into res from public.lodging_reservations where id=p.reservation_id;
 with mine as (select kind,k from public.lodging_payment_keys where pid=p.id and k is not null),
 grp as (
  select v.kind,v.k,count(distinct v.pid) pays,
   (select sum(a) from (select distinct on (x.pid) x.pid,x.amount a from public.lodging_payment_keys x where x.kind=v.kind and x.k=v.k order by x.pid) s) total,
   max(v.receipt_amount) rec
  from public.lodging_payment_keys v join mine m on m.kind=v.kind and m.k=v.k group by v.kind,v.k having count(distinct v.pid)>1
 ), flagged as (select * from grp where rec is null or total>rec*1.01+50)
 select count(distinct b.pid),max(g.full_name),max(rb.check_in),coalesce(bool_or(f.kind='file'),false)
  into hits,other_guest,other_date,is_file
 from flagged f join public.lodging_payment_keys b on b.kind=f.kind and b.k=f.k and b.pid<>p.id
 left join public.lodging_reservations rb on rb.id=b.rid
 left join public.lodging_guests g on g.id=rb.guest_id;
 if coalesce(hits,0)=0 then return 0; end if;
 if exists(select 1 from public.notifications where event_key='lodging.receipt.duplicate' and entity_id=r.id) then return hits; end if;
 select name into unit_name from public.business_units where id=r.business_unit_id;
 select name into room_name from public.lodging_rooms where id=res.room_id;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id)
 select r.company_id,r.business_unit_id,pr.id,'lodging.receipt.duplicate','Posible comprobante repetido',
  coalesce(unit_name,'Hostal')||': el comprobante de '||coalesce(room_name,'una habitación')||' ('||res.check_in||' al '||res.check_out||') trae '||
  case when is_file then 'el mismo archivo' else 'el mismo número de operación' end||' que otro pago'||
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
