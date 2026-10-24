-- El aviso de derivación lleva el link directo a la conversación en el ERP,
-- donde el equipo responde al cliente («Responder como equipo»). La base no
-- conoce la dirección del ERP, así que se guarda en la configuración.

alter table public.lucia_settings
  add column app_url text not null default 'https://www.oasis-erp.cl'
  check (app_url ~ '^https?://[^\s/]+$');
grant select(app_url) on public.lucia_settings to authenticated;

create or replace function public.lucia_alert_review(c public.lucia_conversations) returns void
language plpgsql security definer set search_path = '' as $$
declare body text; link text;
begin
  if c.channel <> 'whatsapp' then return; end if;
  select s.app_url || '/lodging/lucia/' || c.id || '#responder' into link
  from public.lucia_settings s where s.company_id = c.company_id;
  body := '🔔 Lucía necesita ayuda con un cliente' ||
    E'\n👤 ' || coalesce(c.guest_name, c.contact_name, 'Sin nombre') || coalesce(' · ' || c.contact_phone, '') ||
    E'\n📝 ' || coalesce(nullif(c.review_reason, ''), 'Pide revisión humana') ||
    E'\n💬 Respóndele aquí (sale por el WhatsApp de Lucía): ' || coalesce(link, 'ERP → Hostales → Prospectos (Lucía)');

  if c.hostel_assigned then
    perform public.lucia_message_manager(c, body);
  else
    insert into public.lucia_staff_messages(company_id, business_unit_id, conversation_id, to_phone, content)
    select distinct c.company_id, c.business_unit_id, c.id, p.phone, left(body, 4000)
    from public.lucia_hostels h
    cross join lateral unnest(h.admin_phones) as p(phone)
    where h.company_id = c.company_id and h.enabled and p.phone is not null;
  end if;

  perform public.lucia_notify_unit(c, 'lucia.needs_review', 'Lucía pide revisión',
    coalesce(c.guest_name, c.contact_name, 'Cliente') || ': ' || coalesce(nullif(c.review_reason, ''), 'Pide revisión humana'));
end $$;
revoke execute on function public.lucia_alert_review(public.lucia_conversations) from public, anon, authenticated;
