-- WhatsApp del administrador por hostal: recibe los mismos avisos que el
-- encargado (solicitudes, confirmaciones, comprobantes) y puede responder
-- "OK ####" / "NO ####", por ejemplo fuera del horario de recepción.
-- Vale la primera respuesta, venga de quien venga.

alter table public.lucia_hostels
  add column admin_phone text check (admin_phone is null or admin_phone ~ '^\+[1-9][0-9]{7,14}$');
grant update(admin_phone) on public.lucia_hostels to authenticated;

create or replace function public.lucia_message_manager(c public.lucia_conversations, body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if c.channel <> 'whatsapp' then return; end if;
  insert into public.lucia_staff_messages(company_id, business_unit_id, conversation_id, to_phone, content)
  select distinct c.company_id, c.business_unit_id, c.id, p.phone, left(body, 4000)
  from public.lucia_hostels h
  cross join lateral (values (h.manager_phone), (h.admin_phone)) as p(phone)
  where h.company_id = c.company_id and h.business_unit_id = c.business_unit_id and p.phone is not null;
end $$;
revoke execute on function public.lucia_message_manager(public.lucia_conversations, text) from public, anon, authenticated;

-- "OK ####" / "NO ####" también desde el número del administrador. Se cambia
-- solo esa condición de la función vigente para no reescribir el resto.
do $$
declare def text := pg_get_functiondef('public.lucia_ingest_message(jsonb)'::regprocedure);
begin
  if position('h.manager_phone=phone' in def) = 0 then
    raise exception 'lucia_ingest_message cambió: revisar la condición del encargado';
  end if;
  execute replace(def, 'h.manager_phone=phone', 'phone in (h.manager_phone,h.admin_phone)');
end $$;
