begin;

-- Sobre-reserva: las reservas simultáneas quedan fuera de la restricción de cruce (se admiten varias sobre la
-- misma pieza). Las reservas normales siguen sin poder cruzarse entre sí, ni las importadas entre sí.
alter table public.lodging_reservations drop constraint if exists lodging_reservations_no_overlap_excl;
alter table public.lodging_reservations add constraint lodging_reservations_no_overlap_excl
  exclude using gist (
    room_id with =,
    ((imported_from_ical)::int) with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status not in ('cancelled', 'conflict') and not simultaneous);

-- Si la pieza ya tiene un huésped con check-in en esas noches, la reserva nueva se carga como simultánea sin
-- necesidad de marcar la casilla. Sin check-in sigue pidiendo la casilla «Reserva simultánea».
do $$
declare
  def text := pg_get_functiondef('public.create_lodging_reservation(jsonb)'::regprocedure);
  anchor text := $old$coalesce((payload->>'allow_overlap')::boolean,false) and exists($old$;
begin
  if position(anchor in def) = 0 then
    raise exception 'create_lodging_reservation cambió: revisar la reserva simultánea';
  end if;
  execute replace(def, anchor,
    $new$(coalesce((payload->>'allow_overlap')::boolean,false) or exists(
      select 1 from public.lodging_reservations c
      where c.room_id=(payload->>'room_id')::uuid and c.status='checked_in'
        and daterange(c.check_in,c.check_out,'[)') && daterange((payload->>'check_in')::date,(payload->>'check_out')::date,'[)'))) and exists($new$);
end $$;

commit;
