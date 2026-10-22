begin;

-- Si un cliente anuncia que va directamente a una hostal, o que ya espera en
-- la entrada, Lucía avisa de verdad al equipo por WhatsApp y en el ERP. La
-- conversación queda serializada para no repetir avisos durante reintentos.
create or replace function public.lucia_alert_walk_in(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.lucia_conversations;
  h public.lucia_hostels;
  v_status text := payload->>'status';
  v_event text;
  v_title text;
  v_message text;
  v_link text;
  v_window interval;
begin
  if v_status not in ('on_the_way', 'at_entrance') then
    raise exception 'Estado de visita directa no válido';
  end if;

  select * into strict c
  from public.lucia_conversations
  where id = nullif(payload->>'conversation_id', '')::uuid
  for update;

  if not c.hostel_assigned then
    raise exception 'No se puede avisar sin identificar la hostal';
  end if;

  select * into h
  from public.lucia_hostels
  where company_id = c.company_id
    and business_unit_id = c.business_unit_id
    and enabled;
  if h.id is null then raise exception 'Hostal no configurada para Lucía'; end if;

  v_event := case when v_status = 'at_entrance' then 'walk_in_at_entrance' else 'walk_in_on_the_way' end;
  v_window := case when v_status = 'at_entrance' then interval '15 minutes' else interval '2 hours' end;
  if exists (
    select 1 from public.lucia_events e
    where e.conversation_id = c.id and e.event_type = v_event
      and e.created_at > now() - v_window
  ) then
    return jsonb_build_object('sent', false, 'reason', 'duplicate');
  end if;

  v_link := nullif(rtrim(coalesce(payload->>'app_url', ''), '/'), '');
  if v_link is not null then v_link := v_link || '/lodging/lucia/' || c.id::text; end if;

  if v_status = 'at_entrance' then
    v_title := 'Lucía: cliente esperando en la entrada';
    v_message := '🚨 CLIENTE EN LA ENTRADA · ' || h.display_name || E'\n'
      || 'Un cliente informa que ya está afuera o esperando que le abran. Atiéndelo de inmediato o contáctalo desde el número de la hostal.';
    update public.lucia_conversations
    set needs_review = true,
        review_reason = case when needs_review then review_reason else 'Cliente esperando en la entrada: atención inmediata' end,
        updated_at = now()
    where id = c.id;
  else
    v_title := 'Lucía: cliente en camino';
    v_message := '🚶 CLIENTE EN CAMINO · ' || h.display_name || E'\n'
      || 'Un cliente indicó que va directamente a ver o reservar una habitación. Confirma que alguien podrá recibirlo.';
  end if;
  if v_link is not null then v_message := v_message || E'\n' || v_link; end if;

  insert into public.lucia_events(company_id, business_unit_id, conversation_id, severity, event_type, message, context)
  values(c.company_id, c.business_unit_id, c.id,
    case when v_status = 'at_entrance' then 'warning' else 'info' end,
    v_event, left(v_title, 2000), jsonb_build_object('status', v_status));

  perform public.lucia_message_manager(c, v_message);
  perform public.lucia_notify_unit(c, 'lucia.' || v_event, v_title,
    case when v_status = 'at_entrance'
      then 'El cliente está afuera y necesita atención inmediata.'
      else 'El cliente va directamente al lugar; coordina quién lo recibirá.' end);

  return jsonb_build_object('sent', true, 'status', v_status);
end $$;

revoke execute on function public.lucia_alert_walk_in(jsonb) from public, anon, authenticated;
grant execute on function public.lucia_alert_walk_in(jsonb) to service_role;

commit;
