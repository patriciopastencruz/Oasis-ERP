begin;

-- Solicitar la anulación. Devuelve la solicitud y si quedó aplicada. Las
-- reservas que empiezan hoy o después se anulan de inmediato (con motivo);
-- las que empezaron en días anteriores requieren aprobación del administrador
-- o superior, salvo que quien la pide ya pueda aprobar.
create or replace function public.lodging_reservation_cancel_request(target_reservation uuid,cancel_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_res public.lodging_reservations; v_id uuid; approver boolean; v_reason text:=btrim(coalesce(cancel_reason,'')); room_name text;
begin
 approver:=public.has_permission('lodging.reservations.cancel_approve');
 if me is null or not (approver or public.has_permission('lodging.reservations.cancel_request')) then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 -- Del día o futura: no requiere aprobación.
 if v_res.check_in >= (now() at time zone 'America/Santiago')::date then approver:=true; end if;
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

commit;
