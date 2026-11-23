begin;

-- Mover una reserva a una habitación que ya tiene otra en las mismas noches (sobre-reserva).
-- Hasta ahora arrastrar una reserva sobre una pieza ocupada fallaba con «ya está reservada». Ahora recepción
-- puede confirmar el cruce: la reserva movida queda marcada como simultánea (queda fuera de la restricción de
-- cruce) y el calendario muestra ambas en carriles. Sin confirmación (allow_overlap = false) el cruce sigue
-- rechazándose con un mensaje distinguible para que la pantalla pregunte antes de mover.
-- Las reservas importadas por iCal se mueven como siempre: no entran en la lógica de sobre-reserva.

-- La regla «una simultánea no se cruza con reservas nuevas al cambiar de habitación» se relaja solo dentro de
-- move_lodging_reservation, que levanta una marca válida únicamente durante su propia transacción.
do $$
declare
  def text := pg_get_functiondef('public.lodging_reservation_move_guard()'::regprocedure);
  anchor text := $a$and not (o.id=any(old_overlaps)) and o.status<>'checked_in') then$a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'lodging_reservation_move_guard cambió: revisar el movimiento con sobre-reserva';
  end if;
  execute replace(def, anchor,
    $new$and not (o.id=any(old_overlaps)) and o.status<>'checked_in')
     and coalesce(current_setting('oasis.lodging_move_overlap',true),'')<>'on' then$new$);
end $$;

create or replace function public.move_lodging_reservation(
  target_reservation uuid,
  target_room uuid,
  allow_overlap boolean default false
) returns text language plpgsql security definer set search_path='' as $$
declare r public.lodging_reservations%rowtype; dest public.lodging_rooms%rowtype; crossing int;
begin
  if auth.uid() is null or not public.has_permission('lodging.reservations.manage') then
    raise exception 'Sin autorizacion';
  end if;
  select * into r from public.lodging_reservations where id=target_reservation for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Sin autorizacion'; end if;
  if r.status in('cancelled','conflict','checked_out') then
    raise exception 'La reserva ya no se puede cambiar de habitacion';
  end if;
  select * into dest from public.lodging_rooms
  where id=target_room and business_unit_id=r.business_unit_id and active;
  if not found then raise exception 'Habitacion no valida para esta reserva'; end if;
  if dest.id=r.room_id then return 'unchanged'; end if;

  if r.imported_from_ical then
    update public.lodging_reservations set room_id=dest.id where id=r.id;
    return 'moved';
  end if;

  select count(*) into crossing from public.lodging_reservations o
  where o.id<>r.id and o.room_id=dest.id and o.status not in('cancelled','conflict') and not o.imported_from_ical
    and daterange(o.check_in,o.check_out,'[)') && daterange(r.check_in,r.check_out,'[)');

  if crossing=0 then
    update public.lodging_reservations set room_id=dest.id, simultaneous=false where id=r.id;
    return 'moved';
  end if;
  if not coalesce(allow_overlap,false) then
    raise exception 'Sobre-reserva: la habitacion ya esta reservada en esas fechas';
  end if;

  perform set_config('oasis.lodging_move_overlap','on',true);
  update public.lodging_reservations set room_id=dest.id, simultaneous=true where id=r.id;
  perform set_config('oasis.lodging_move_overlap','',true);
  insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
  values(r.company_id,r.business_unit_id,auth.uid(),'move_overbooked','lodging_reservations',r.id,
    jsonb_build_object('room_id',r.room_id,'simultaneous',r.simultaneous),
    jsonb_build_object('room_id',dest.id,'simultaneous',true,'crossing_reservations',crossing));
  return 'overbooked';
end $$;

revoke execute on function public.move_lodging_reservation(uuid,uuid,boolean) from public,anon;
grant execute on function public.move_lodging_reservation(uuid,uuid,boolean) to authenticated;

commit;
