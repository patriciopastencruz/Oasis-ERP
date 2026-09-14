begin;

-- La reconciliación del sync iCal (synchronizeUnit) comparaba las reservas
-- importadas contra TODO el historial del feed sin filtrar por fecha.
-- Booking/Airbnb dejan de listar en el feed las estadías ya completadas
-- (no las marcan CANCELLED, simplemente dejan de aparecer), así que tras
-- dos sincronizaciones seguidas sin verlas el sistema las cancelaba solas.
-- Esto se corrige en el código (actions.ts) acotando la reconciliación a
-- estadías vigentes o recién terminadas; esta migración repara los datos
-- ya afectados por el bug.
--
-- Se identifican como "canceladas por el bug" las reservas importadas cuyo
-- evento iCal pasó por el camino de "ausente dos veces" (missing_since no
-- nulo — el único camino que llega a cancelar sin que la OTA la haya
-- marcado CANCELLED explícitamente) y cuyo check_out ya había pasado antes
-- de que se cancelara: un huésped no cancela una estadía después de
-- haberla completado, así que esa combinación aísla el bug de una
-- cancelación real hecha por el huésped antes o durante su estadía.
--
-- Al desaparecer la reserva original, la pieza quedó libre en el
-- calendario y en algunos casos se tomó una reserva nueva para las mismas
-- fechas (o el propio feed dejó dos bloqueos que se traslapan entre sí):
-- restaurar esos colisionaría con la restricción de exclusión de traslape
-- (room_id, daterange). Esos casos NO se tocan aquí — quedan para revisión
-- manual, porque decidir cuál reserva es la real le corresponde a una
-- persona, no a esta migración.
--
-- Se restaura a 'confirmed' (no 'checked_out'): es el único estado que el
-- propio sync asigna al crear una reserva; 'checked_in'/'checked_out' solo
-- los pone el personal a mano desde la app y no hay forma de reconstruir
-- si eso había ocurrido antes de que el bug la cancelara.
do $$
declare
  restored_count int;
  cleared_count int;
  skipped_count int;
begin
  create temporary table lodging_restore_candidates on commit drop as
  select r.id as reservation_id, e.id as event_id, r.room_id, r.check_in, r.check_out
  from public.lodging_reservations r
  join public.lodging_ical_events e on e.reservation_id = r.id
  where r.status = 'cancelled'
    and r.imported_from_ical = true
    and e.missing_since is not null
    and r.check_out < r.cancelled_at::date;

  delete from lodging_restore_candidates c
  where exists (
    select 1 from public.lodging_reservations other
    where other.room_id = c.room_id
      and other.id <> c.reservation_id
      and other.status <> 'cancelled'
      and daterange(other.check_in, other.check_out, '[)')
          && daterange(c.check_in, c.check_out, '[)')
  )
  or exists (
    select 1 from lodging_restore_candidates other
    where other.room_id = c.room_id
      and other.reservation_id <> c.reservation_id
      and daterange(other.check_in, other.check_out, '[)')
          && daterange(c.check_in, c.check_out, '[)')
  );
  get diagnostics skipped_count = row_count;

  update public.lodging_reservations r
  set status = 'confirmed', cancelled_at = null
  from lodging_restore_candidates c
  where c.reservation_id = r.id;
  get diagnostics restored_count = row_count;

  update public.lodging_ical_events e
  set missing_since = null
  from lodging_restore_candidates c
  where c.event_id = e.id;
  get diagnostics cleared_count = row_count;

  raise notice 'lodging: % reservas restauradas, % omitidas por choque de fechas (revisión manual), % eventos iCal limpiados',
    restored_count, skipped_count, cleared_count;
end $$;

commit;
