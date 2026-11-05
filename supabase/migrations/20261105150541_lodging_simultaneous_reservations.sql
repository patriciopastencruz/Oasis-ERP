begin;

-- Reserva simultánea: una pieza admite una segunda reserva manual sobre las mismas noches cuando recepción
-- lo pide de forma explícita al crearla. La marca solo la pone create_lodging_reservation (y únicamente si
-- de verdad se cruza con otra reserva manual activa); entra en la clave del exclusion constraint, así que
-- la reserva normal y la simultánea pueden convivir, pero nunca hay más de una simultánea a la vez.
alter table public.lodging_reservations add column simultaneous boolean not null default false;

alter table public.lodging_reservations drop constraint lodging_reservations_no_overlap_excl;
alter table public.lodging_reservations
  add constraint lodging_reservations_no_overlap_excl
  exclude using gist (
    room_id with =,
    ((imported_from_ical)::int) with =,
    ((simultaneous)::int) with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (status not in ('cancelled', 'conflict'));

do $$
declare
  def text := pg_get_functiondef('public.create_lodging_reservation(jsonb)'::regprocedure);
  old_cols text := $old$main_reservation_id,stay_group_id,relation_type,created_by)$old$;
  old_vals text := $old$nullif(payload->>'relation_type',''),auth.uid()) returning id into reservation_uuid;$old$;
begin
  if position(old_cols in def) = 0 or position(old_vals in def) = 0 then
    raise exception 'create_lodging_reservation cambió: revisar la reserva simultánea';
  end if;
  def := replace(def, old_cols, $new$main_reservation_id,stay_group_id,relation_type,simultaneous,created_by)$new$);
  def := replace(def, old_vals,
    $new$nullif(payload->>'relation_type',''),
    coalesce((payload->>'allow_overlap')::boolean,false) and exists(
      select 1 from public.lodging_reservations o
      where o.room_id=(payload->>'room_id')::uuid and o.status not in('cancelled','conflict') and not o.imported_from_ical
        and daterange(o.check_in,o.check_out,'[)') && daterange((payload->>'check_in')::date,(payload->>'check_out')::date,'[)')),
    auth.uid()) returning id into reservation_uuid;$new$);
  execute def;
end $$;

commit;
