begin;

-- Al anular una reserva con pagos hay que decidir qué pasa con ellos; antes quedaban confirmados en la
-- reserva anulada y, al volver a crearla, el pago se registraba de nuevo y se contaba dos veces.
--   void    → se anulan (registro repetido o error). Requiere poder anular pagos o aprobar anulaciones.
--   refund  → quedan como devueltos al huésped. Mismo requisito que void.
--   move    → se trasladan a otra reserva vigente de la unidad (la que reemplaza a la anulada).
--   retain  → el hostal se queda con el dinero: sigue contando como ingreso.
-- Si quien anula no puede anular ni devolver pagos, la anulación queda pendiente de aprobación.
-- Lo mismo se puede resolver después en una reserva ya anulada que conserva pagos.

alter table public.lodging_reservations add column payments_retained boolean not null default false;

alter table public.lodging_reservation_cancellations
  add column payments_action text check (payments_action in ('void','refund','move','retain')),
  add column payments_move_to uuid references public.lodging_reservations(id),
  add check (payments_action is distinct from 'move' or payments_move_to is not null);

-- Aplica la decisión sobre los pagos confirmados de una reserva anulada (uso interno, ya validado).
create or replace function public.lodging_cancelled_payments_apply(v_res public.lodging_reservations,v_action text,v_move_to uuid,v_note text)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_ids uuid[]; v_target public.lodging_reservations;
begin
 select coalesce(array_agg(id),'{}') into v_ids from public.lodging_reservation_payments
 where reservation_id=v_res.id and status='confirmed';
 if v_action='retain' then
  update public.lodging_reservations set payments_retained=true where id=v_res.id;
 elsif cardinality(v_ids)=0 then
  return;
 elsif v_action in('void','refund') then
  update public.lodging_reservation_payments set status=case when v_action='void' then 'voided' else 'refunded' end,
   voided_at=now(),voided_by=me,void_reason=left(case when v_action='void' then 'Anulación de la reserva: ' else 'Devuelto al huésped: ' end||v_note,300)
  where id=any(v_ids);
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
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(v_res.company_id,v_res.business_unit_id,me,'cancelled_payments_'||v_action,'lodging_reservations',v_res.id,
  jsonb_build_object('payment_ids',to_jsonb(v_ids)),
  jsonb_build_object('action',v_action,'move_to',v_move_to,'note',v_note));
end $$;
revoke execute on function public.lodging_cancelled_payments_apply(public.lodging_reservations,text,uuid,text) from public,anon,authenticated;

-- Valida la decisión antes de guardarla (uso interno): acción conocida y destino válido.
create or replace function public.lodging_cancelled_payments_check(v_res public.lodging_reservations,v_action text,v_move_to uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if v_action is null or v_action not in('void','refund','move','retain') then raise exception 'Indica que hacer con los pagos'; end if;
 if v_action='move' and not exists(select 1 from public.lodging_reservations t where t.id=v_move_to
   and t.business_unit_id=v_res.business_unit_id and t.id<>v_res.id and t.status not in('cancelled','conflict')) then
  raise exception 'La reserva de destino no es valida';
 end if;
end $$;
revoke execute on function public.lodging_cancelled_payments_check(public.lodging_reservations,text,uuid) from public,anon,authenticated;

-- La anulación aplica también la decisión sobre los pagos guardada en la solicitud.
create or replace function public.lodging_reservation_apply_cancel(v_res public.lodging_reservations,v_reason text,v_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_reservation_cancellations;
begin
 update public.lodging_reservations set status='cancelled',cancelled_at=now(),cancellation_reason=v_reason where id=v_res.id;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(v_res.company_id,v_res.business_unit_id,auth.uid(),'cancel_reservation','lodging_reservations',v_res.id,
  jsonb_build_object('status',v_res.status,'check_in',v_res.check_in,'check_out',v_res.check_out,'total_value',v_res.total_value),
  jsonb_build_object('status','cancelled','reason',v_reason,'request_id',v_request));
 select * into c from public.lodging_reservation_cancellations where id=v_request;
 if c.payments_action is not null then
  perform public.lodging_cancelled_payments_apply(v_res,c.payments_action,c.payments_move_to,v_reason);
 end if;
end $$;
revoke execute on function public.lodging_reservation_apply_cancel(public.lodging_reservations,text,uuid) from public,anon,authenticated;

-- Solicitar la anulación. Con pagos confirmados exige decidir qué pasa con ellos.
drop function public.lodging_reservation_cancel_request(uuid,text);
create function public.lodging_reservation_cancel_request(target_reservation uuid,cancel_reason text,payments_action text default null,payments_move_to uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_res public.lodging_reservations; v_id uuid; approver boolean; v_reason text:=btrim(coalesce(cancel_reason,'')); room_name text;
 v_action text; has_payments boolean;
begin
 approver:=public.has_permission('lodging.reservations.cancel_approve');
 if me is null or not (approver or public.has_permission('lodging.reservations.cancel_request')) then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.imported_from_ical then raise exception 'Las reservas de Booking o Airbnb se anulan en la plataforma'; end if;
 if v_res.status in('cancelled','checked_in','checked_out') then raise exception 'La reserva ya no se puede anular'; end if;
 if char_length(v_reason)<5 then raise exception 'Indica el motivo de la anulacion'; end if;
 if exists(select 1 from public.lodging_reservation_cancellations where reservation_id=v_res.id and status='pending') then raise exception 'Ya hay una solicitud de anulacion pendiente'; end if;
 has_payments:=exists(select 1 from public.lodging_reservation_payments where reservation_id=v_res.id and status='confirmed');
 if has_payments then
  v_action:=payments_action;
  perform public.lodging_cancelled_payments_check(v_res,v_action,payments_move_to);
 end if;
 -- Del día o futura: no requiere aprobación, salvo que anule o devuelva pagos quien no puede hacerlo.
 if v_res.check_in >= (now() at time zone 'America/Santiago')::date then approver:=true; end if;
 if v_action in('void','refund') and not (public.has_permission('lodging.reservations.cancel_approve') or public.has_permission('lodging.payments.void')) then
  approver:=false;
 end if;
 insert into public.lodging_reservation_cancellations(company_id,business_unit_id,reservation_id,reason,status,paid_amount,requested_by,decided_by,decided_at,payments_action,payments_move_to)
 values(v_res.company_id,v_res.business_unit_id,v_res.id,v_reason,case when approver then 'approved' else 'pending' end,public.lodging_reservation_paid(v_res.id),me,
  case when approver then me end,case when approver then now() end,v_action,case when v_action='move' then payments_move_to end) returning id into v_id;
 if approver then
  perform public.lodging_reservation_apply_cancel(v_res,v_reason,v_id);
  return jsonb_build_object('id',v_id,'applied',true);
 end if;
 -- Aviso (y correo) a quienes pueden aprobar en la unidad.
 select name into room_name from public.lodging_rooms where id=v_res.room_id;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select v_res.company_id,v_res.business_unit_id,p.id,'lodging.cancellation.review_assigned','Anulación de reserva por aprobar',
  'Se solicitó anular la reserva de '||coalesce(room_name,'una habitación')||' del '||v_res.check_in||' al '||v_res.check_out||'. Motivo: '||left(v_reason,160),
  'lodging_reservation',v_res.id,me
 from public.profiles p join public.user_business_units u on u.user_id=p.id and u.business_unit_id=v_res.business_unit_id
 where p.active and p.deleted_at is null and p.id<>me and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=p.role_id and k.key='lodging.reservations.cancel_approve' and k.active);
 return jsonb_build_object('id',v_id,'applied',false);
end $$;
revoke execute on function public.lodging_reservation_cancel_request(uuid,text,text,uuid) from public,anon;
grant execute on function public.lodging_reservation_cancel_request(uuid,text,text,uuid) to authenticated;

-- Resolver los pagos que quedaron en una reserva ya anulada.
create or replace function public.lodging_cancelled_payments_settle(target_reservation uuid,payments_action text,payments_move_to uuid,note text)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_res public.lodging_reservations; v_note text:=btrim(coalesce(note,''));
begin
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if me is null or v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if payments_action in('void','refund') then
  if not (public.has_permission('lodging.payments.void') or public.has_permission('lodging.reservations.cancel_approve')) then raise exception 'Sin autorizacion'; end if;
 elsif not (public.has_permission('lodging.payments.manage') or public.has_permission('lodging.reservations.cancel_approve')) then
  raise exception 'Sin autorizacion';
 end if;
 if v_res.status not in('cancelled','conflict') then raise exception 'La reserva no esta anulada'; end if;
 if v_res.payments_retained then raise exception 'Los pagos ya quedaron retenidos'; end if;
 if not exists(select 1 from public.lodging_reservation_payments where reservation_id=v_res.id and status='confirmed') then
  raise exception 'La reserva no tiene pagos por resolver';
 end if;
 if char_length(v_note)<3 then raise exception 'Indica una nota'; end if;
 perform public.lodging_cancelled_payments_check(v_res,payments_action,payments_move_to);
 perform public.lodging_cancelled_payments_apply(v_res,payments_action,payments_move_to,v_note);
end $$;
revoke execute on function public.lodging_cancelled_payments_settle(uuid,text,uuid,text) from public,anon;
grant execute on function public.lodging_cancelled_payments_settle(uuid,text,uuid,text) to authenticated;

-- Los pagos retenidos de una reserva anulada cuentan como ingreso del día y del mes.
do $$
declare
  def text := pg_get_functiondef('public.lodging_closing_base_metrics_internal(uuid,date)'::regprocedure);
  anchor text := $a$and r.status not in('cancelled','conflict'))$a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'lodging_closing_base_metrics_internal cambió: revisar los pagos retenidos';
  end if;
  execute replace(def, anchor, $new$and (r.status not in('cancelled','conflict') or r.payments_retained))$new$);
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  counted text := $a$and r.status not in('cancelled','conflict'))$a$;
  pending text := $a$r.status in('cancelled','conflict'))$a$;
begin
  if (length(def) - length(replace(def, counted, ''))) / length(counted) <> 1
     or (length(def) - length(replace(def, pending, ''))) / length(pending) <> 1 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar los pagos retenidos';
  end if;
  def := replace(def, counted, $new$and (r.status not in('cancelled','conflict') or r.payments_retained))$new$);
  def := replace(def, pending, $new$r.status in('cancelled','conflict') and not r.payments_retained)$new$);
  execute def;
end $$;

commit;
