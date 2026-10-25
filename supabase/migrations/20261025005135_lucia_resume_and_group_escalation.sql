begin;

-- 1) Al terminar la pausa (el equipo respondió y llegó el cierre de
--    recepción), Lucía contesta los mensajes del cliente que quedaron sin
--    respuesta. Antes esperaba a que el cliente volviera a escribir.
-- 2) Si un caso derivado o una solicitud de reserva lleva 30 minutos sin que
--    el equipo responda, Lucía avisa en el grupo de WhatsApp del equipo qué
--    hostal (y su encargado) no ha respondido.

-- ===== 1. Retomar al terminar la pausa =====

-- Devuelve los chats a procesar y los marca (paused_until = null) para no
-- repetirlos. Solo pausas que vencieron en las últimas 6 horas.
create or replace function public.lucia_resume_after_pause(target_company uuid) returns setof uuid
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.lucia_conversations c
     set paused_until = null, pause_reason = null, updated_at = now()
   where c.company_id = target_company
     and c.channel = 'whatsapp'
     and c.status = 'lucia'
     and c.paused_until <= now()
     and c.paused_until > now() - interval '6 hours'
     and c.unanswered_since is not null
  returning c.id;
end $$;
revoke execute on function public.lucia_resume_after_pause(uuid) from public, anon, authenticated;
grant execute on function public.lucia_resume_after_pause(uuid) to service_role;

-- ===== 2. Aviso al grupo del equipo =====

-- Grupos de WhatsApp en los que está el número de Lucía (los informa el
-- worker al conectarse) para elegir el grupo del equipo en Configuración.
create table public.lucia_wa_groups (
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  jid text not null check (jid ~ '^[0-9-]+@g\.us$'),
  subject text not null default '' check (length(subject) <= 200),
  updated_at timestamptz not null default now(),
  primary key (company_id, jid),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);
alter table public.lucia_wa_groups enable row level security;
create policy lucia_wa_groups_read on public.lucia_wa_groups for select to authenticated using (
  public.can_access_company(company_id) and public.has_permission('lucia.settings.manage')
);
grant select on public.lucia_wa_groups to authenticated;

alter table public.lucia_settings
  add column staff_group_jid text check (staff_group_jid is null or staff_group_jid ~ '^[0-9-]+@g\.us$');
grant select(staff_group_jid), update(staff_group_jid) on public.lucia_settings to authenticated;

-- Los avisos al equipo pueden ir a un teléfono o a un grupo.
alter table public.lucia_staff_messages
  alter column to_phone drop not null,
  add column to_jid text check (to_jid is null or to_jid ~ '^[0-9-]+@g\.us$'),
  add constraint lucia_staff_messages_destination check (to_phone is not null or to_jid is not null);

do $$
declare
  def text := pg_get_functiondef('public.lucia_claim_outbound(uuid)'::regprocedure);
  old_jid text := '''jid'',substr(sm.to_phone,2)||''@s.whatsapp.net''';
begin
  if position(old_jid in def) = 0 then raise exception 'lucia_claim_outbound cambió: revisar el destino de los avisos'; end if;
  execute replace(def, old_jid, '''jid'',coalesce(sm.to_jid,substr(sm.to_phone,2)||''@s.whatsapp.net'')');
end $$;

-- Cuándo se pidió ayuda y cuándo se escaló, para medir los 30 minutos.
alter table public.lucia_conversations
  add column review_requested_at timestamptz,
  add column escalated_at timestamptz;
create index lucia_conversations_escalation_idx on public.lucia_conversations(company_id)
  where needs_review or booking_status = 'awaiting_reception';

create or replace function public.lucia_conversation_review_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.needs_review and (tg_op = 'INSERT' or not old.needs_review) then
    new.review_requested_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.lucia_conversation_review_stamp() from public, anon, authenticated;
create trigger lucia_conversation_review_stamp before insert or update of needs_review on public.lucia_conversations
  for each row execute function public.lucia_conversation_review_stamp();

-- Casos sin respuesta del equipo hace 30 minutos: un aviso por caso al grupo
-- (o, sin grupo elegido, a los administradores). Solo entre 08:00 y 23:30.
create or replace function public.lucia_escalate_unanswered(target_company uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.lucia_settings;
  r record;
  sent integer := 0;
  local_time time := (now() at time zone 'America/Santiago')::time;
  body text;
begin
  select * into s from public.lucia_settings where company_id = target_company;
  if not found or local_time < time '08:00' or local_time > time '23:30' then return 0; end if;

  for r in
    select c.*, h.display_name as hostel_name, h.manager_name,
           coalesce(case when c.booking_status = 'awaiting_reception' then c.booking_requested_at end, c.review_requested_at) as since
      from public.lucia_conversations c
      left join public.lucia_hostels h on h.company_id = c.company_id and h.business_unit_id = c.business_unit_id
     where c.company_id = target_company
       and c.channel = 'whatsapp'
       and c.status <> 'closed'
       and (c.needs_review or c.booking_status = 'awaiting_reception')
       and coalesce(case when c.booking_status = 'awaiting_reception' then c.booking_requested_at end, c.review_requested_at) < now() - interval '30 minutes'
       and (c.escalated_at is null
            or c.escalated_at < coalesce(case when c.booking_status = 'awaiting_reception' then c.booking_requested_at end, c.review_requested_at))
       -- Nadie del equipo respondió desde que se pidió ayuda.
       and not exists (
         select 1 from public.lucia_messages m
          where m.conversation_id = c.id and m.sender_type = 'human'
            and m.created_at >= coalesce(case when c.booking_status = 'awaiting_reception' then c.booking_requested_at end, c.review_requested_at))
     for update of c skip locked
  loop
    body := '⚠️ Cliente sin respuesta del equipo hace ' ||
      (extract(epoch from now() - r.since) / 60)::int || ' min' ||
      E'\n🏨 ' || case when r.hostel_assigned then coalesce(r.hostel_name, 'Hostal') else 'Sin hostal asignada' end ||
      case when r.hostel_assigned and r.manager_name is not null then ' · encargada/o: ' || r.manager_name else '' end ||
      E'\n👤 ' || coalesce(r.guest_name, r.contact_name, 'Sin nombre') || coalesce(' · ' || r.contact_phone, '') ||
      E'\n📝 ' || case when r.booking_status = 'awaiting_reception'
                       then 'Solicitud de reserva ' || coalesce(r.booking_code, '') || ' por confirmar'
                       else coalesce(nullif(r.review_reason, ''), 'Pidió ayuda a una persona') end ||
      E'\n💬 Responder: ' || s.app_url || '/chats/' || r.id;

    if s.staff_group_jid is not null then
      insert into public.lucia_staff_messages(company_id, business_unit_id, conversation_id, to_jid, content)
      values (r.company_id, r.business_unit_id, r.id, s.staff_group_jid, left(body, 4000));
    else
      insert into public.lucia_staff_messages(company_id, business_unit_id, conversation_id, to_phone, content)
      select distinct r.company_id, r.business_unit_id, r.id, p.phone, left(body, 4000)
        from public.lucia_hostels h
        cross join lateral unnest(h.admin_phones) as p(phone)
       where h.company_id = r.company_id and h.enabled and p.phone is not null;
    end if;
    update public.lucia_conversations set escalated_at = now() where id = r.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.lucia_escalate_unanswered(uuid) from public, anon, authenticated;
grant execute on function public.lucia_escalate_unanswered(uuid) to service_role;

commit;
