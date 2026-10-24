-- Cuando Lucía deriva un caso a una persona (needs_review pasa a true), el
-- equipo se entera de inmediato: WhatsApp al encargado y administradores de
-- la hostal (o, si la hostal aún no está clara, a los administradores de todas)
-- y aviso en el ERP. Antes solo quedaba la marca en la bandeja, aunque Lucía
-- le decía al cliente que ya había avisado.

create or replace function public.lucia_alert_review(c public.lucia_conversations) returns void
language plpgsql security definer set search_path = '' as $$
declare body text;
begin
  if c.channel <> 'whatsapp' then return; end if;
  body := '🔔 Lucía necesita ayuda con un cliente' ||
    E'\n👤 ' || coalesce(c.guest_name, c.contact_name, 'Sin nombre') || coalesce(' · ' || c.contact_phone, '') ||
    E'\n📝 ' || coalesce(nullif(c.review_reason, ''), 'Pide revisión humana') ||
    E'\nRespóndele por este WhatsApp desde el ERP: Hostales → Prospectos (Lucía).';

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

create or replace function public.lucia_conversation_review_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.needs_review and not old.needs_review then
    perform public.lucia_alert_review(new);
  end if;
  return new;
end $$;
revoke execute on function public.lucia_conversation_review_alert() from public, anon, authenticated;

create trigger lucia_conversation_review_alert after update of needs_review on public.lucia_conversations
  for each row execute function public.lucia_conversation_review_alert();
