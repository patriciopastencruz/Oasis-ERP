begin;

-- Reglas del calendario:
-- 1) Una reserva simultánea (fuera de la restricción de cruce) no puede, al cambiar de habitación o de fechas,
--    cruzarse con reservas que antes no cruzaba, salvo huéspedes con check-in. Si ya no cruza ninguna, deja de
--    ser simultánea y vuelve a la restricción normal.
-- 2) La marca automática de simultánea (pieza con huésped con check-in) aplica solo si todo lo que cruza tiene
--    check-in; si además cruza una reserva confirmada o pendiente, hay que marcar la casilla a propósito.
-- 3) Al cambiar de habitación, la nueva debe admitir la cantidad de huéspedes.
-- 4) El check-in se hace entre la fecha de llegada y la de salida (incluida, por llegadas de madrugada).

create or replace function public.lodging_reservation_move_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cap int; new_overlaps uuid[]; old_overlaps uuid[];
begin
 if new.status in('cancelled','conflict') then return new; end if;
 if new.room_id is distinct from old.room_id then
  select capacity into cap from public.lodging_rooms where id=new.room_id;
  if cap is not null and coalesce(new.guest_count,1)>cap then raise exception 'La habitacion no admite esa cantidad de huespedes'; end if;
 end if;
 if new.simultaneous and (new.room_id is distinct from old.room_id or new.check_in<>old.check_in or new.check_out<>old.check_out) then
  select coalesce(array_agg(o.id),'{}') into new_overlaps from public.lodging_reservations o
  where o.id<>new.id and o.room_id=new.room_id and o.status not in('cancelled','conflict') and not o.imported_from_ical
   and daterange(o.check_in,o.check_out,'[)') && daterange(new.check_in,new.check_out,'[)');
  select coalesce(array_agg(o.id),'{}') into old_overlaps from public.lodging_reservations o
  where o.id<>old.id and o.room_id=old.room_id and o.status not in('cancelled','conflict') and not o.imported_from_ical
   and daterange(o.check_in,o.check_out,'[)') && daterange(old.check_in,old.check_out,'[)');
  if cardinality(new_overlaps)=0 then
   new.simultaneous:=false;
  elsif exists(select 1 from public.lodging_reservations o where o.id=any(new_overlaps)
     and not (o.id=any(old_overlaps)) and o.status<>'checked_in') then
   raise exception 'La habitacion ya esta reservada en esas fechas';
  end if;
 end if;
 return new;
end $$;
revoke execute on function public.lodging_reservation_move_guard() from public,anon,authenticated;
create trigger lodging_reservation_move_guard before update of room_id,check_in,check_out on public.lodging_reservations
 for each row execute function public.lodging_reservation_move_guard();

do $$
declare
  def text := pg_get_functiondef('public.create_lodging_reservation(jsonb)'::regprocedure);
  anchor text := $a$and daterange(c.check_in,c.check_out,'[)') && daterange((payload->>'check_in')::date,(payload->>'check_out')::date,'[)'))) and exists($a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'create_lodging_reservation cambió: revisar la marca automática de simultánea';
  end if;
  execute replace(def, anchor, $new$and daterange(c.check_in,c.check_out,'[)') && daterange((payload->>'check_in')::date,(payload->>'check_out')::date,'[)'))
      and not exists(
      select 1 from public.lodging_reservations f
      where f.room_id=(payload->>'room_id')::uuid and f.status not in('cancelled','conflict','checked_in') and not f.imported_from_ical
        and daterange(f.check_in,f.check_out,'[)') && daterange((payload->>'check_in')::date,(payload->>'check_out')::date,'[)'))) and exists($new$);
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lodging_check_in(uuid,text)'::regprocedure);
  anchor text := $a$ if v_res.status<>'confirmed' then raise exception 'La reserva no esta confirmada'; end if;$a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'lodging_check_in cambió: revisar la validación de fechas';
  end if;
  execute replace(def, anchor, anchor || $new$
 if (now() at time zone 'America/Santiago')::date<v_res.check_in or (now() at time zone 'America/Santiago')::date>v_res.check_out then
  raise exception 'El check-in se hace entre la fecha de llegada y la de salida';
 end if;$new$);
end $$;

commit;
