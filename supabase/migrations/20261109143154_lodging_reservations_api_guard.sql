begin;

-- Las reservas se escribían también directo por la API (PostgREST) con el permiso de gestionar reservas, y así se
-- saltaban las reglas: anular sin aprobación ni decisión sobre los pagos, check-out con saldo, total a $1, reactivar
-- anuladas, marcarse como importada o simultánea. Este control aplica solo a esas escrituras directas
-- (current_user authenticated/anon); las funciones del sistema (security definer) y los procesos del servidor
-- (service_role) ya validan sus propias reglas.
--   INSERT: nace pendiente o confirmada, no importada, y con el total que corresponde a tarifa, noches, descuento y recargo.
--   UPDATE: no cambia estado, unidad, marcas de importación/simultánea/retención, anulación, no-show ni check-in/out;
--           el total de una reserva no importada debe cuadrar con la tarifa; el cambio de habitación exige una
--           habitación activa del mismo hostal y una reserva vigente.
create or replace function public.lodging_reservation_api_guard() returns trigger language plpgsql set search_path='' as $$
declare expected numeric;
begin
 if current_user not in('authenticated','anon') then return new; end if;
 expected:=coalesce(new.nightly_rate,0)*(new.check_out-new.check_in)-coalesce(new.discount,0)+coalesce(new.surcharge,0);
 if tg_op='INSERT' then
  if new.status not in('pending','confirmed') or new.imported_from_ical or new.payments_retained or coalesce(new.no_show,false)
     or new.cancelled_at is not null or new.actual_check_in is not null or new.actual_check_out is not null then
   raise exception 'Estado no permitido al crear la reserva';
  end if;
  if abs(new.total_value-expected)>1 then raise exception 'El total no corresponde a la tarifa de la reserva'; end if;
  return new;
 end if;
 if (new.status,new.company_id,new.business_unit_id,new.origin,new.imported_from_ical,new.external_uid,new.external_calendar_id,new.external_source,
     new.simultaneous,new.payments_retained,new.cancelled_at,new.cancellation_reason,new.no_show,new.no_show_at,new.no_show_by,
     new.actual_check_in,new.actual_check_out,new.reviewed_by,new.reviewed_at,new.departure_processed_at,new.created_by)
    is distinct from
    (old.status,old.company_id,old.business_unit_id,old.origin,old.imported_from_ical,old.external_uid,old.external_calendar_id,old.external_source,
     old.simultaneous,old.payments_retained,old.cancelled_at,old.cancellation_reason,old.no_show,old.no_show_at,old.no_show_by,
     old.actual_check_in,old.actual_check_out,old.reviewed_by,old.reviewed_at,old.departure_processed_at,old.created_by) then
  raise exception 'Ese cambio se hace desde las acciones de la reserva';
 end if;
 if not old.imported_from_ical and new.total_value is distinct from old.total_value and abs(new.total_value-expected)>1 then
  raise exception 'El total no corresponde a la tarifa de la reserva';
 end if;
 if new.room_id is distinct from old.room_id then
  if old.status in('cancelled','conflict','checked_out') then raise exception 'La reserva ya no se puede cambiar de habitacion'; end if;
  if not exists(select 1 from public.lodging_rooms r where r.id=new.room_id and r.business_unit_id=new.business_unit_id and r.active) then
   raise exception 'Habitacion no valida para esta reserva';
  end if;
 end if;
 return new;
end $$;
revoke execute on function public.lodging_reservation_api_guard() from public,anon,authenticated;
create trigger lodging_reservation_api_guard before insert or update on public.lodging_reservations
 for each row execute function public.lodging_reservation_api_guard();

-- El cambio de habitación queda en la auditoría, venga de donde venga.
create or replace function public.audit_lodging_reservation_room_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(new.company_id,new.business_unit_id,auth.uid(),'change_room','lodging_reservations',new.id,
  jsonb_build_object('room_id',old.room_id),jsonb_build_object('room_id',new.room_id));
 return null;
end $$;
revoke execute on function public.audit_lodging_reservation_room_change() from public,anon,authenticated;
create trigger audit_lodging_reservation_room_change after update of room_id on public.lodging_reservations
 for each row when (old.room_id is distinct from new.room_id) execute function public.audit_lodging_reservation_room_change();

-- Un comprobante es del mismo hostal que su pago.
create or replace function public.lodging_receipt_unit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lodging_reservation_payments p where p.id=new.payment_id
   and p.company_id=new.company_id and p.business_unit_id=new.business_unit_id) then
  raise exception 'El comprobante debe ser del mismo hostal que el pago';
 end if;
 return new;
end $$;
revoke execute on function public.lodging_receipt_unit_guard() from public,anon,authenticated;
create trigger lodging_receipt_unit_guard before insert or update of payment_id,business_unit_id,company_id on public.lodging_payment_receipts
 for each row execute function public.lodging_receipt_unit_guard();

commit;
