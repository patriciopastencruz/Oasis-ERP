begin;

-- 1) Una reserva manual puede convivir con una importada por iCal.
--
-- El exclusion constraint original (20260714003139) impedía que dos
-- reservas activas compartieran habitación y fechas. Eso bloqueaba crear a
-- mano una reserva sobre un bloqueo/reserva que llegó de Booking o Airbnb
-- (que además llega sin nombre ni precio). Ahora la clave incluye si la
-- reserva viene del iCal: manual contra manual y iCal contra iCal siguen
-- chocando (el sync sigue marcando 'conflict' entre canales), pero una
-- manual y una importada pueden solaparse.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.lodging_reservations'::regclass and contype = 'x'
  loop
    execute format('alter table public.lodging_reservations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.lodging_reservations
  add constraint lodging_reservations_no_overlap_excl
  exclude using gist (
    room_id with =,
    ((imported_from_ical)::int) with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (status not in ('cancelled', 'conflict'));

-- 2) Eliminar (anular) una reserva importada por iCal.
--
-- No se borra la fila (las operaciones comerciales se anulan, no se
-- eliminan): pasa a 'cancelled', libera la fecha y queda en audit_logs. El
-- sync no la resucita: el evento sigue en lodging_ical_events y, mientras
-- su contenido no cambie, no se vuelve a importar.
--
-- Regla de tiempo: quien administra reservas puede anular las que empiezan
-- hoy o después; las anteriores (check_in < hoy en Santiago) requieren el
-- permiso lodging.reservations.remove_past, que solo tiene el
-- Superadministrador.
insert into public.permissions(key, module, description) values
  ('lodging.reservations.remove_past', 'lodging',
   'Eliminar reservas importadas de días anteriores')
on conflict (key) do update set description = excluded.description, active = true;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'lodging.reservations.remove_past'
where r.key = 'superadmin'
on conflict do nothing;

create or replace function public.remove_lodging_imported_reservation(target_reservation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  today date := (now() at time zone 'America/Santiago')::date;
  net_paid numeric;
begin
  if not public.has_permission('lodging.reservations.manage') then
    raise exception 'Sin autorización';
  end if;

  select * into r from public.lodging_reservations where id = target_reservation for update;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if not public.can_access_unit(r.company_id, r.business_unit_id) then
    raise exception 'Sin autorización';
  end if;
  if not r.imported_from_ical then
    raise exception 'Solo se pueden eliminar reservas importadas desde Booking/Airbnb';
  end if;
  if r.status in ('cancelled', 'checked_in', 'checked_out') then
    raise exception 'Esta reserva ya no se puede eliminar (estado: %)', r.status;
  end if;
  if r.check_in < today and not public.has_permission('lodging.reservations.remove_past') then
    raise exception 'Solo el administrador puede eliminar reservas de días anteriores';
  end if;

  select coalesce(sum(case when type = 'refund' then -amount else amount end), 0)
    into net_paid
  from public.lodging_reservation_payments
  where reservation_id = target_reservation and status = 'confirmed';
  if net_paid > 0 then
    raise exception 'La reserva tiene pagos registrados; anúlalos antes de eliminarla';
  end if;

  update public.lodging_reservations
  set status = 'cancelled', cancelled_at = now()
  where id = target_reservation;

  insert into public.audit_logs(company_id, business_unit_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (r.company_id, r.business_unit_id, auth.uid(), 'remove_imported_reservation',
          'lodging_reservations', r.id, to_jsonb(r),
          jsonb_build_object('status', 'cancelled'));
end
$$;

grant execute on function public.remove_lodging_imported_reservation(uuid) to authenticated;
revoke execute on function public.remove_lodging_imported_reservation(uuid) from public, anon;

commit;
