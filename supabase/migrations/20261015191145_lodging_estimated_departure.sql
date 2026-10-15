begin;

-- Hora aproximada de salida del huésped, informada por recepción (igual que la
-- hora aproximada de llegada). Es solo informativa: no cambia los procesos de
-- salida ni de limpieza.
alter table public.lodging_reservations add column if not exists estimated_departure time;

create or replace function public.set_lodging_reservation_departure(target_reservation uuid, departure time) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.lodging_reservations;
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=target_reservation for update;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if r.status in('cancelled','checked_out','conflict') then raise exception 'La reserva ya no admite cambios de horario'; end if;
 update public.lodging_reservations set estimated_departure=departure where id=r.id;
end $$;
revoke execute on function public.set_lodging_reservation_departure(uuid,time) from public,anon;
grant execute on function public.set_lodging_reservation_departure(uuid,time) to authenticated;

commit;
