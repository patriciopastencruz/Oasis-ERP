begin;

-- Esta protección se ejecuta ante cualquier UPDATE, no solo desde la
-- interfaz. Así nadie puede enviar un total calculado por el navegador ni
-- saltarse las reglas llamando directamente a la API de datos.
create or replace function public.guard_lodging_reservation_date_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.check_in = old.check_in and new.check_out = old.check_out then
    return new;
  end if;
  if auth.role() <> 'service_role' and (
    auth.uid() is null
    or not public.has_permission('lodging.reservations.manage')
    or not public.can_access_unit(old.company_id, old.business_unit_id)
  ) then
    raise exception 'Sin autorización';
  end if;
  if old.imported_from_ical and auth.role() <> 'service_role' then
    raise exception 'Las fechas de una reserva importada se modifican en Booking o Airbnb';
  end if;
  if old.status in ('cancelled', 'checked_in', 'checked_out')
     and auth.role() <> 'service_role' then
    raise exception 'No se pueden editar las fechas de una reserva finalizada o anulada';
  end if;
  if new.check_in is null or new.check_out is null or new.check_out <= new.check_in then
    raise exception 'La fecha de salida debe ser posterior a la fecha de entrada';
  end if;

  if not old.imported_from_ical then
    new.total_value :=
      ((new.check_out - new.check_in) * new.nightly_rate) - new.discount + new.surcharge;
    if new.total_value < 0 then
      raise exception 'El total recalculado no puede ser negativo';
    end if;
  end if;
  return new;
end
$$;

create trigger guard_lodging_reservation_date_change
before update of check_in, check_out on public.lodging_reservations
for each row
execute function public.guard_lodging_reservation_date_change();

create or replace function public.audit_lodging_reservation_date_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.check_in = old.check_in and new.check_out = old.check_out then
    return new;
  end if;
  insert into public.audit_logs(
    company_id, business_unit_id, actor_id, action, entity_type, entity_id,
    old_data, new_data
  ) values (
    new.company_id, new.business_unit_id, auth.uid(),
    'update_reservation_dates', 'lodging_reservations', new.id,
    jsonb_build_object(
      'check_in', old.check_in, 'check_out', old.check_out,
      'nights', old.nights, 'total_value', old.total_value
    ),
    jsonb_build_object(
      'check_in', new.check_in, 'check_out', new.check_out,
      'nights', new.nights, 'total_value', new.total_value
    )
  );
  return new;
end
$$;

create trigger audit_lodging_reservation_date_change
after update of check_in, check_out on public.lodging_reservations
for each row
execute function public.audit_lodging_reservation_date_change();

revoke execute on function public.guard_lodging_reservation_date_change()
from public, anon, authenticated;
revoke execute on function public.audit_lodging_reservation_date_change()
from public, anon, authenticated;

-- La operación usada por la interfaz conserva el bloqueo de fila y vuelve a
-- comprobar permiso/unidad antes de ejecutar el UPDATE protegido por RLS.
create or replace function public.update_lodging_reservation_dates(
  target_reservation uuid,
  new_check_in date,
  new_check_out date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.lodging_reservations%rowtype;
begin
  if auth.uid() is null or not public.has_permission('lodging.reservations.manage') then
    raise exception 'Sin autorización';
  end if;

  select * into r
  from public.lodging_reservations
  where id = target_reservation
  for update;

  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if not public.can_access_unit(r.company_id, r.business_unit_id) then
    raise exception 'Sin autorización para esta unidad';
  end if;
  if r.imported_from_ical then
    raise exception 'Las fechas de una reserva importada se modifican en Booking o Airbnb';
  end if;
  if r.status in ('cancelled', 'checked_in', 'checked_out') then
    raise exception 'No se pueden editar las fechas de una reserva finalizada o anulada';
  end if;
  if new_check_in is null or new_check_out is null or new_check_out <= new_check_in then
    raise exception 'La fecha de salida debe ser posterior a la fecha de entrada';
  end if;

  if r.check_in = new_check_in and r.check_out = new_check_out then
    return;
  end if;

  update public.lodging_reservations
  set check_in = new_check_in,
      check_out = new_check_out
  where id = target_reservation;
end
$$;

revoke execute on function public.update_lodging_reservation_dates(uuid, date, date)
from public, anon;
grant execute on function public.update_lodging_reservation_dates(uuid, date, date)
to authenticated;

commit;
