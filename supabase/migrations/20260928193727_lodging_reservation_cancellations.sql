begin;

-- Anulación de reservas con aprobación. Recepción solicita la anulación con
-- motivo; la aprueba o rechaza el administrador o un rango superior
-- (gerencia). Si quien la pide ya puede aprobar, queda aprobada al instante
-- (sigue quedando registrada). La reserva nunca se borra: pasa a
-- 'cancelled' y todo queda en audit_logs. Las reservas de Booking/Airbnb se
-- anulan en la plataforma y llegan por iCal.

insert into public.permissions(key,module,description) values
 ('lodging.reservations.cancel_request','lodging','Solicitar la anulación de una reserva'),
 ('lodging.reservations.cancel_approve','lodging','Aprobar o rechazar anulaciones de reservas (administrador o superior)')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (p.key='lodging.reservations.cancel_request' and r.key in('receptionist','administrator','superadmin','general_manager'))
   or (p.key='lodging.reservations.cancel_approve' and r.key in('administrator','superadmin','general_manager'))
   -- Quien aprueba anulaciones necesita ver las reservas (en producción ya lo tiene).
   or (p.key='lodging.reservations.view' and r.key in('administrator','general_manager'))
on conflict do nothing;

alter table public.lodging_reservations add column cancellation_reason text;

create table public.lodging_reservation_cancellations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 reservation_id uuid not null references public.lodging_reservations(id),
 reason text not null check(char_length(btrim(reason)) between 5 and 500),
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 paid_amount numeric(14,0) not null default 0,
 requested_by uuid not null references public.profiles(id),
 requested_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 decision_notes text check(decision_notes is null or char_length(decision_notes)<=500),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(status='pending' or (decided_by is not null and decided_at is not null)),
 check(status<>'rejected' or char_length(coalesce(btrim(decision_notes),''))>=3)
);
-- Una sola solicitud pendiente por reserva.
create unique index lodging_reservation_cancellations_pending_idx on public.lodging_reservation_cancellations(reservation_id) where status='pending';
create index lodging_reservation_cancellations_unit_idx on public.lodging_reservation_cancellations(company_id,business_unit_id,status,requested_at desc);
create trigger audit_lodging_reservation_cancellations after insert or update or delete on public.lodging_reservation_cancellations
 for each row execute function public.audit_row_change();

alter table public.lodging_reservation_cancellations enable row level security;
create policy lodging_reservation_cancellations_read on public.lodging_reservation_cancellations for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
revoke all on public.lodging_reservation_cancellations from public,anon,authenticated;
grant select on public.lodging_reservation_cancellations to authenticated;

-- Aplica la anulación sobre la reserva ya bloqueada (uso interno).
create or replace function public.lodging_reservation_apply_cancel(v_res public.lodging_reservations,v_reason text,v_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.lodging_reservations set status='cancelled',cancelled_at=now(),cancellation_reason=v_reason where id=v_res.id;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(v_res.company_id,v_res.business_unit_id,auth.uid(),'cancel_reservation','lodging_reservations',v_res.id,
  jsonb_build_object('status',v_res.status,'check_in',v_res.check_in,'check_out',v_res.check_out,'total_value',v_res.total_value),
  jsonb_build_object('status','cancelled','reason',v_reason,'request_id',v_request));
end $$;
revoke execute on function public.lodging_reservation_apply_cancel(public.lodging_reservations,text,uuid) from public,anon,authenticated;

create or replace function public.lodging_reservation_paid(target_reservation uuid) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(case when type='refund' then -amount else amount end),0) from public.lodging_reservation_payments
 where reservation_id=target_reservation and status='confirmed'
$$;
revoke execute on function public.lodging_reservation_paid(uuid) from public,anon,authenticated;

-- Solicitar la anulación. Devuelve la solicitud y si quedó aplicada.
create or replace function public.lodging_reservation_cancel_request(target_reservation uuid,cancel_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_res public.lodging_reservations; v_id uuid; approver boolean; v_reason text:=btrim(coalesce(cancel_reason,'')); room_name text;
begin
 approver:=public.has_permission('lodging.reservations.cancel_approve');
 if me is null or not (approver or public.has_permission('lodging.reservations.cancel_request')) then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.imported_from_ical then raise exception 'Las reservas de Booking o Airbnb se anulan en la plataforma'; end if;
 if v_res.status in('cancelled','checked_in','checked_out') then raise exception 'La reserva ya no se puede anular'; end if;
 if char_length(v_reason)<5 then raise exception 'Indica el motivo de la anulacion'; end if;
 if exists(select 1 from public.lodging_reservation_cancellations where reservation_id=v_res.id and status='pending') then raise exception 'Ya hay una solicitud de anulacion pendiente'; end if;
 insert into public.lodging_reservation_cancellations(company_id,business_unit_id,reservation_id,reason,status,paid_amount,requested_by,decided_by,decided_at)
 values(v_res.company_id,v_res.business_unit_id,v_res.id,v_reason,case when approver then 'approved' else 'pending' end,public.lodging_reservation_paid(v_res.id),me,
  case when approver then me end,case when approver then now() end) returning id into v_id;
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

-- Aprobar o rechazar (administrador o superior).
create or replace function public.lodging_reservation_cancel_decide(target_request uuid,approve boolean,notes text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); c public.lodging_reservation_cancellations; v_res public.lodging_reservations;
begin
 if me is null or not public.has_permission('lodging.reservations.cancel_approve') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_reservation_cancellations where id=target_request for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Solicitud no encontrada'; end if;
 if c.status<>'pending' then raise exception 'La solicitud ya fue resuelta'; end if;
 if not approve and char_length(btrim(coalesce(notes,'')))<3 then raise exception 'Indica el motivo del rechazo'; end if;
 select * into v_res from public.lodging_reservations where id=c.reservation_id for update;
 if approve and v_res.status in('cancelled','checked_in','checked_out') then raise exception 'La reserva ya no se puede anular'; end if;
 update public.lodging_reservation_cancellations set status=case when approve then 'approved' else 'rejected' end,decided_by=me,decided_at=now(),
  decision_notes=nullif(btrim(coalesce(notes,'')),'') where id=c.id;
 if approve then perform public.lodging_reservation_apply_cancel(v_res,c.reason,c.id); end if;
 -- Aviso a quien la solicitó.
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 values(c.company_id,c.business_unit_id,c.requested_by,'lodging.cancellation.decided',
  case when approve then 'Anulación aprobada' else 'Anulación rechazada' end,
  case when approve then 'Se anuló la reserva del '||v_res.check_in||' al '||v_res.check_out||'.'
   else 'No se anuló la reserva del '||v_res.check_in||' al '||v_res.check_out||'. Motivo: '||left(btrim(notes),160) end,
  'lodging_reservation',v_res.id,me);
end $$;

revoke execute on function public.lodging_reservation_cancel_request(uuid,text),public.lodging_reservation_cancel_decide(uuid,boolean,text) from public,anon;
grant execute on function public.lodging_reservation_cancel_request(uuid,text),public.lodging_reservation_cancel_decide(uuid,boolean,text) to authenticated;

commit;
