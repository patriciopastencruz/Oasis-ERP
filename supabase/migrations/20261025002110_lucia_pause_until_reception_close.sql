begin;

-- Cuando el equipo responde un chat (desde el ERP, la app de chats o el
-- teléfono), Lucía se pausa solo hasta que cierra la recepción de esa hostal
-- y después retoma sola. Antes la pausa era fija de 12 horas: si recepción
-- respondía a las 18:00, Lucía no volvía hasta las 06:00 y de noche nadie
-- contestaba. Si alguien responde fuera del horario, la pausa es de 1 hora.

alter table public.lucia_hostels
  add column reception_close_time time not null default '19:00',
  add column reception_close_time_weekend time;
grant update(reception_close_time, reception_close_time_weekend) on public.lucia_hostels to authenticated;

-- Horarios de recepción de los manuales (sábado y domingo distintos en Modulares).
update public.lucia_hostels h set reception_close_time = '19:30'
  from public.business_units bu where bu.id = h.business_unit_id and bu.code = 'HOB';
update public.lucia_hostels h set reception_close_time = '23:30', reception_close_time_weekend = '19:00'
  from public.business_units bu where bu.id = h.business_unit_id and bu.code = 'HOC';

create or replace function public.lucia_staff_pause_until(c public.lucia_conversations) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  local_now timestamp := now() at time zone 'America/Santiago';
  close_at time;
  close_ts timestamptz;
begin
  select case when extract(isodow from local_now) in (6, 7) then coalesce(h.reception_close_time_weekend, h.reception_close_time)
              else h.reception_close_time end
    into close_at
  from public.lucia_hostels h
  where h.company_id = c.company_id and h.business_unit_id = c.business_unit_id;
  close_ts := (local_now::date + coalesce(close_at, time '19:00')) at time zone 'America/Santiago';
  -- Dentro del horario: hasta el cierre. Ya cerrado (o a minutos de cerrar): 1 hora.
  if close_ts > now() + interval '15 minutes' then return close_ts; end if;
  return now() + interval '1 hour';
end $$;
revoke execute on function public.lucia_staff_pause_until(public.lucia_conversations) from public, anon, authenticated;
grant execute on function public.lucia_staff_pause_until(public.lucia_conversations) to service_role;

create or replace function public.lucia_send_reply(target_conversation uuid, body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.lucia_conversations; mid uuid;
begin
  c := public.lucia_conversation_for_reply(target_conversation);
  mid := public.lucia_enqueue_outbound(c, 'human', auth.uid(), body, null);
  update public.lucia_drafts set status = 'superseded' where conversation_id = c.id and status = 'pending';
  update public.lucia_conversations
    set paused_until = public.lucia_staff_pause_until(c), pause_reason = 'El equipo respondió desde el ERP', updated_at = now()
  where id = c.id and c.channel <> 'simulator';
  return mid;
end $$;

-- Mensajes escritos desde el teléfono: misma regla. Solo cambia esa línea de
-- la función vigente para no reescribir el resto.
do $$
declare
  def text := pg_get_functiondef('public.lucia_ingest_message(jsonb)'::regprocedure);
  old_line text := 'paused_until=now()+interval ''12 hours'',pause_reason=''El equipo respondió desde el teléfono''';
begin
  if position(old_line in def) = 0 then
    raise exception 'lucia_ingest_message cambió: revisar la pausa por mensajes del teléfono';
  end if;
  execute replace(def, old_line, 'paused_until=public.lucia_staff_pause_until(conv),pause_reason=''El equipo respondió desde el teléfono''');
end $$;

commit;
