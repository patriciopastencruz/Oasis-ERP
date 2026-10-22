-- Varios administradores por hostal: admin_phone pasa a ser una lista. Todos
-- reciben los avisos del encargado y pueden responder "OK ####" / "NO ####";
-- vale la primera respuesta.

create or replace function public.lucia_valid_phones(phones text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(phones), 0) <= 5
    and coalesce((select bool_and(p ~ '^\+[1-9][0-9]{7,14}$') from unnest(phones) as p), true)
$$;

alter table public.lucia_hostels
  add column admin_phones text[] not null default '{}' check (public.lucia_valid_phones(admin_phones));
update public.lucia_hostels set admin_phones = array[admin_phone] where admin_phone is not null;
grant update(admin_phones) on public.lucia_hostels to authenticated;

create or replace function public.lucia_message_manager(c public.lucia_conversations, body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if c.channel <> 'whatsapp' then return; end if;
  insert into public.lucia_staff_messages(company_id, business_unit_id, conversation_id, to_phone, content)
  select distinct c.company_id, c.business_unit_id, c.id, p.phone, left(body, 4000)
  from public.lucia_hostels h
  cross join lateral unnest(array_prepend(h.manager_phone, h.admin_phones)) as p(phone)
  where h.company_id = c.company_id and h.business_unit_id = c.business_unit_id and p.phone is not null;
end $$;
revoke execute on function public.lucia_message_manager(public.lucia_conversations, text) from public, anon, authenticated;

-- Solo cambia la condición de quién puede responder en la función vigente.
do $$
declare def text := pg_get_functiondef('public.lucia_ingest_message(jsonb)'::regprocedure);
begin
  if position('phone in (h.manager_phone,h.admin_phone)' in def) = 0 then
    raise exception 'lucia_ingest_message cambió: revisar la condición del encargado';
  end if;
  execute replace(def, 'phone in (h.manager_phone,h.admin_phone)', 'phone = any(array_prepend(h.manager_phone,h.admin_phones))');
end $$;

alter table public.lucia_hostels drop column admin_phone;
