begin;

-- Correcciones de pagos de hostales:
-- 1) Control al registrar pagos: mismo hostal que la reserva, nada nuevo en reservas anuladas, sin fecha futura
--    y sin fecha de un día cuyo cierre ya se emitió (quedaba fuera de todo cierre: se registra con la fecha de hoy).
-- 2) «Devolver» al anular registra la devolución el día en que se hace (fila type='refund') en vez de marcar el pago
--    original como devuelto, que borraba el ingreso de ese día hacia atrás. Los pagos de esa reserva quedan como reales
--    (payments_retained): el cobro cuenta su día y la devolución el suyo.
-- 3) Los pagos retenidos o devueltos de reservas anuladas entran al ingreso del mes por su fecha de pago.
-- 4) Al aprobar una anulación pendiente que entretanto recibió pagos, quien aprueba decide qué hacer con ellos.
-- 5) Lucía no anula por vencimiento una retención que ya tiene pagos confirmados.

comment on column public.lodging_reservations.payments_retained is
  'Reserva anulada cuyos pagos son reales y cuentan como ingreso por su fecha: retenidos, o devueltos con su devolución registrada.';

create or replace function public.lodging_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.lodging_reservations; d date; internal boolean:=coalesce(current_setting('lodging.settling_payments',true),'')='1';
begin
 select * into r from public.lodging_reservations where id=new.reservation_id;
 if r.id is null or r.company_id<>new.company_id or r.business_unit_id<>new.business_unit_id then
  raise exception 'El pago debe ser del mismo hostal que la reserva';
 end if;
 if tg_op='INSERT' and not internal and r.status in('cancelled','conflict') then
  raise exception 'La reserva esta anulada: no se registran pagos nuevos';
 end if;
 if tg_op='INSERT' or new.paid_at is distinct from old.paid_at then
  if new.paid_at>now()+interval '10 minutes' then raise exception 'La fecha del pago no puede ser futura'; end if;
  d:=(new.paid_at at time zone 'America/Santiago')::date;
  if not internal and d<(now() at time zone 'America/Santiago')::date and exists(
    select 1 from public.lodging_daily_closings c where c.business_unit_id=new.business_unit_id and c.closing_date=d and c.status='issued') then
   raise exception 'El cierre de ese dia ya fue emitido: registra el pago con la fecha de hoy';
  end if;
 end if;
 return new;
end $$;
revoke execute on function public.lodging_payment_guard() from public,anon,authenticated;
create trigger lodging_payment_guard before insert or update of paid_at,reservation_id,business_unit_id,company_id
 on public.lodging_reservation_payments for each row execute function public.lodging_payment_guard();

-- La decisión sobre los pagos de una reserva anulada. «refund» registra la devolución hoy.
create or replace function public.lodging_cancelled_payments_apply(v_res public.lodging_reservations,v_action text,v_move_to uuid,v_note text)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_ids uuid[]; v_target public.lodging_reservations;
begin
 select coalesce(array_agg(id),'{}') into v_ids from public.lodging_reservation_payments
 where reservation_id=v_res.id and status='confirmed';
 perform set_config('lodging.settling_payments','1',true);
 if v_action='retain' then
  update public.lodging_reservations set payments_retained=true where id=v_res.id;
 elsif cardinality(v_ids)=0 then
  null;
 elsif v_action='void' then
  update public.lodging_reservation_payments set status='voided',
   voided_at=now(),voided_by=me,void_reason=left('Anulación de la reserva: '||v_note,300)
  where id=any(v_ids);
 elsif v_action='refund' then
  insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,notes,registered_by)
  select v_res.company_id,v_res.business_unit_id,v_res.id,'refund',payment_method,net,now(),left('Devolución por anulación: '||v_note,300),me
  from (select payment_method,sum(case when type='refund' then -amount else amount end) as net
        from public.lodging_reservation_payments where id=any(v_ids) group by 1) m
  where net>0;
  update public.lodging_reservations set payments_retained=true where id=v_res.id;
 elsif v_action='move' then
  select * into v_target from public.lodging_reservations where id=v_move_to for update;
  if v_target.id is null or v_target.business_unit_id<>v_res.business_unit_id or v_target.id=v_res.id
     or v_target.status in('cancelled','conflict') then
   raise exception 'La reserva de destino no es valida';
  end if;
  update public.lodging_reservation_payments set reservation_id=v_target.id,
   notes=left(concat_ws(' · ',nullif(notes,''),'Trasladado desde una reserva anulada'),500)
  where id=any(v_ids);
 else
  raise exception 'Indica que hacer con los pagos';
 end if;
 perform set_config('lodging.settling_payments','',true);
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(v_res.company_id,v_res.business_unit_id,me,'cancelled_payments_'||v_action,'lodging_reservations',v_res.id,
  jsonb_build_object('payment_ids',to_jsonb(v_ids)),
  jsonb_build_object('action',v_action,'move_to',v_move_to,'note',v_note));
end $$;
revoke execute on function public.lodging_cancelled_payments_apply(public.lodging_reservations,text,uuid,text) from public,anon,authenticated;

-- Aprobar o rechazar. Si la reserva tiene pagos y la solicitud no trae decisión, la indica quien aprueba.
drop function public.lodging_reservation_cancel_decide(uuid,boolean,text);
create function public.lodging_reservation_cancel_decide(target_request uuid,approve boolean,notes text,payments_action text default null,payments_move_to uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); c public.lodging_reservation_cancellations; v_res public.lodging_reservations;
begin
 if me is null or not public.has_permission('lodging.reservations.cancel_approve') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_reservation_cancellations where id=target_request for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Solicitud no encontrada'; end if;
 if c.status<>'pending' then raise exception 'La solicitud ya fue resuelta'; end if;
 if not approve and char_length(btrim(coalesce(notes,'')))<3 then raise exception 'Indica el motivo del rechazo'; end if;
 select * into v_res from public.lodging_reservations where id=c.reservation_id for update;
 if approve and v_res.status in('cancelled','checked_in','checked_out') then raise exception 'La reserva ya no se puede anular'; end if;
 if approve and exists(select 1 from public.lodging_reservation_payments where reservation_id=v_res.id and status='confirmed') then
  if payments_action is not null then
   perform public.lodging_cancelled_payments_check(v_res,payments_action,payments_move_to);
   c.payments_action:=payments_action;
   c.payments_move_to:=case when payments_action='move' then payments_move_to end;
  elsif c.payments_action is null then
   raise exception 'Indica que hacer con los pagos';
  end if;
 end if;
 update public.lodging_reservation_cancellations set status=case when approve then 'approved' else 'rejected' end,decided_by=me,decided_at=now(),
  decision_notes=nullif(btrim(coalesce(notes,'')),''),payments_action=c.payments_action,payments_move_to=c.payments_move_to where id=c.id;
 if approve then perform public.lodging_reservation_apply_cancel(v_res,c.reason,c.id); end if;
 -- Aviso a quien la solicitó.
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 values(c.company_id,c.business_unit_id,c.requested_by,'lodging.cancellation.decided',
  case when approve then 'Anulación aprobada' else 'Anulación rechazada' end,
  case when approve then 'Se anuló la reserva del '||v_res.check_in||' al '||v_res.check_out||'.'
   else 'No se anuló la reserva del '||v_res.check_in||' al '||v_res.check_out||'. Motivo: '||left(btrim(notes),160) end,
  'lodging_reservation',v_res.id,me);
end $$;
revoke execute on function public.lodging_reservation_cancel_decide(uuid,boolean,text,text,uuid) from public,anon;
grant execute on function public.lodging_reservation_cancel_decide(uuid,boolean,text,text,uuid) to authenticated;

-- Los pagos reales (retenidos o devueltos) de reservas anuladas suman al ingreso del mes por su fecha de pago.
do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  ctes text := $a$ ), commissions as ($a$;
  income text := $a$   (select amount from sales)+coalesce($a$;
  keys text := $a$  'reconciliation',jsonb_build_object($a$;
begin
  if (length(def) - length(replace(def, ctes, ''))) / length(ctes) <> 1
     or (length(def) - length(replace(def, income, ''))) / length(income) <> 1
     or (length(def) - length(replace(def, keys, ''))) / length(keys) <> 1 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar los pagos retenidos';
  end if;
  def := replace(def, ctes, $new$ ), retained as (
  select coalesce(sum(case when p.type='refund' then -p.amount else p.amount end),0) as amount,count(distinct p.reservation_id)::int as reservations
  from public.lodging_reservation_payments p join public.lodging_reservations r on r.id=p.reservation_id,bounds b
  where p.business_unit_id=target_unit and p.status='confirmed' and r.status in('cancelled','conflict') and r.payments_retained
   and (p.paid_at at time zone 'America/Santiago')::date>=b.start_date and (p.paid_at at time zone 'America/Santiago')::date<b.next_date
 ), commissions as ($new$);
  def := replace(def, income, $new$   (select amount from sales)+(select amount from retained)+coalesce($new$);
  def := replace(def, keys, $new$  'retained',(select jsonb_build_object('total',amount,'reservations',reservations) from retained),
$new$ || keys);
  execute def;
end $$;

-- Lucía no anula por vencimiento una retención que ya tiene pagos confirmados: la resuelve recepción.
do $$
declare
  def text := pg_get_functiondef('public.lucia_expire_holds(uuid)'::regprocedure);
  anchor text := $a$and booking_status='awaiting_payment' and hold_expires_at<now() for update skip locked loop$a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'lucia_expire_holds cambió: revisar el vencimiento con pagos';
  end if;
  execute replace(def, anchor, $new$and booking_status='awaiting_payment' and hold_expires_at<now()
   and not exists(select 1 from public.lodging_reservation_payments p where p.reservation_id=lucia_conversations.reservation_id and p.status='confirmed')
   for update skip locked loop$new$);
end $$;

select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';

commit;
