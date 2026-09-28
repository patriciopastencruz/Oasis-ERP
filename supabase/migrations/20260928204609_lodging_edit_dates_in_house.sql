begin;

-- Editar fechas con las mismas reglas que corregir precio: se permite con la
-- estadía en curso (check-in hecho); con check-out solo el administrador o
-- superior; nunca en anuladas ni en reservas de Booking/Airbnb.

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
  -- Misma regla que la corrección de precio: anuladas no; con check-out solo
  -- el administrador o superior; con check-in (estadía en curso) sí.
  if old.status = 'cancelled' and auth.role() <> 'service_role' then
    raise exception 'No se pueden editar las fechas de una reserva anulada';
  end if;
  if old.status = 'checked_out' and auth.role() <> 'service_role'
     and not public.has_permission('lodging.reservations.cancel_approve') then
    raise exception 'Solo el administrador corrige las fechas de una reserva con check-out';
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
  if r.status = 'cancelled' then
    raise exception 'No se pueden editar las fechas de una reserva anulada';
  end if;
  if r.status = 'checked_out' and not public.has_permission('lodging.reservations.cancel_approve') then
    raise exception 'Solo el administrador corrige las fechas de una reserva con check-out';
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

commit;
