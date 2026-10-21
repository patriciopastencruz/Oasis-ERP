begin;

-- Lucía: asistente de WhatsApp de las tres hostales (HU, HOC, HOB) desde un
-- número central. El número se vincula por QR desde un worker Node.js
-- (Baileys) que corre fuera de Vercel; el worker solo habla con la base
-- mediante las funciones service_role de este archivo y nunca guarda la
-- clave de Claude, que vive solo en variables de entorno del servidor.
--
-- Unidad de negocio:
-- * La configuración general, los contactos excluidos, el consumo y la
--   bitácora quedan en la unidad "base" de Lucía (lucia_settings.business_unit_id).
-- * Cada conversación pertenece a una hostal. Mientras Lucía no sabe a cuál
--   (hostel_assigned=false) queda en la unidad base y la ve cualquier usuario
--   con acceso a alguna hostal de Lucía; al asignarse pasa a ser visible solo
--   para esa hostal.
--
-- Etapa 1 (este archivo): Lucía solo redacta borradores; nada se envía sin
-- que una persona presione "Enviar". Lucía nunca modifica ni borra reservas.

insert into public.permissions(key,module,description) values
 ('lucia.inbox.view','lucia','Ver la bandeja de prospectos de Lucía'),
 ('lucia.inbox.reply','lucia','Enviar, editar o descartar borradores de Lucía, responder y tomar control de un chat'),
 ('lucia.settings.manage','lucia','Configurar Lucía, vincular el WhatsApp central y usar el simulador')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in('receptionist','lodging_supervisor','general_manager','area_manager','superadmin')
 and p.key in('lucia.inbox.view','lucia.inbox.reply')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in('general_manager','superadmin') and p.key='lucia.settings.manage'
on conflict do nothing;

create table public.lucia_settings(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 agent_name text not null default 'Lucía' check(length(trim(agent_name)) between 1 and 60),
 general_instructions text not null default '' check(length(general_instructions)<=20000),
 model text not null default 'claude-haiku-4-5' check(model ~ '^claude-[a-z0-9.-]+$'),
 daily_budget_usd numeric(10,2) not null default 5 check(daily_budget_usd>=0 and daily_budget_usd<=1000),
 max_messages_per_minute smallint not null default 6 check(max_messages_per_minute between 1 and 30),
 history_messages smallint not null default 15 check(history_messages between 1 and 50),
 budget_exceeded_on date,
 -- Estado de la conexión; solo lo escribe el worker (service_role).
 connection_status text not null default 'disconnected' check(connection_status in('disconnected','qr_pending','connecting','connected','error')),
 qr_code text,
 qr_updated_at timestamptz,
 connected_phone text,
 worker_heartbeat_at timestamptz,
 last_connection_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 unique(company_id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
comment on table public.lucia_settings is 'Configuración general de Lucía por empresa. Nunca guarda claves: ANTHROPIC_API_KEY vive solo en variables de entorno.';

create table public.lucia_hostels(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 manual text not null default '' check(length(manual)<=40000),
 manager_name text check(manager_name is null or length(manager_name)<=120),
 manager_phone text check(manager_phone is null or manager_phone ~ '^\+[1-9][0-9]{7,14}$'),
 mode text not null default 'draft' check(mode in('draft','auto')),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 unique(business_unit_id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);

create table public.lucia_excluded_contacts(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 phone_e164 text not null check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 label text not null check(length(trim(label)) between 1 and 120),
 category text not null default 'otro' check(category in('familia','equipo','encargado','otro')),
 created_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 unique(company_id,phone_e164),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);

create table public.lucia_conversations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 hostel_assigned boolean not null default false,
 channel text not null check(channel in('whatsapp','simulator','instagram')),
 contact_jid text not null check(length(contact_jid) between 3 and 160),
 contact_phone text check(contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
 contact_name text check(contact_name is null or length(contact_name)<=160),
 -- lucia: Lucía redacta; human: alguien tomó control; closed: archivada.
 status text not null default 'lucia' check(status in('lucia','human','closed')),
 paused_until timestamptz,
 pause_reason text,
 needs_review boolean not null default false,
 review_reason text check(review_reason is null or length(review_reason)<=300),
 taken_by uuid references public.profiles(id),
 taken_at timestamptz,
 -- Ficha del prospecto (la completa Lucía y la puede corregir una persona).
 prospect_status text not null default 'new' check(prospect_status in('new','quoted','pre_reserved','confirmed','lost')),
 guest_name text check(guest_name is null or length(guest_name)<=160),
 check_in date,
 check_out date,
 guests smallint check(guests is null or guests between 1 and 60),
 room_type text check(room_type is null or length(room_type)<=120),
 preferences text check(preferences is null or length(preferences)<=500),
 quoted_amount numeric(14,2) check(quoted_amount is null or quoted_amount>=0),
 quoted_at timestamptz,
 reservation_id uuid references public.lodging_reservations(id),
 last_message_at timestamptz,
 last_inbound_at timestamptz,
 last_outbound_at timestamptz,
 unanswered_since timestamptz,
 closed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 check(check_out is null or check_in is null or check_out>check_in),
 check(status<>'closed' or closed_at is not null),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create unique index lucia_conversations_open_idx on public.lucia_conversations(company_id,channel,contact_jid) where status<>'closed';
create index lucia_conversations_unit_idx on public.lucia_conversations(company_id,business_unit_id,status,last_message_at desc);
create index lucia_conversations_prospect_idx on public.lucia_conversations(company_id,prospect_status,last_outbound_at);

create table public.lucia_messages(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid not null references public.lucia_conversations(id),
 direction text not null check(direction in('inbound','outbound')),
 sender_type text not null check(sender_type in('customer','lucia','human','system')),
 sender_user_id uuid references public.profiles(id),
 message_type text not null default 'text' check(message_type in('text','audio','image','video','document','sticker','location','contact','other')),
 content text check(content is null or length(content)<=8000),
 external_id text,
 delivery_status text not null default 'received' check(delivery_status in('received','queued','sending','sent','failed')),
 error_message text,
 attempts smallint not null default 0,
 draft_id uuid,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 check(direction='inbound' or sender_type<>'customer'),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
-- Idempotencia: un mismo id de WhatsApp nunca se guarda dos veces.
create unique index lucia_messages_external_idx on public.lucia_messages(company_id,external_id) where external_id is not null;
create index lucia_messages_conversation_idx on public.lucia_messages(conversation_id,created_at);
create index lucia_messages_outbox_idx on public.lucia_messages(company_id,created_at) where delivery_status='queued';
create index lucia_messages_sent_idx on public.lucia_messages(company_id,sent_at desc) where direction='outbound';

create table public.lucia_drafts(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid not null references public.lucia_conversations(id),
 content text not null check(length(content) between 1 and 4000),
 intent text not null default 'other',
 needs_human boolean not null default false,
 reason text check(reason is null or length(reason)<=300),
 extracted jsonb not null default '{}',
 status text not null default 'pending' check(status in('pending','sent','discarded','superseded')),
 edited boolean not null default false,
 model text,
 input_tokens integer not null default 0,
 output_tokens integer not null default 0,
 cache_read_tokens integer not null default 0,
 cache_write_tokens integer not null default 0,
 cost_usd numeric(12,6) not null default 0,
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 sent_message_id uuid references public.lucia_messages(id),
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lucia_drafts_conversation_idx on public.lucia_drafts(conversation_id,created_at desc);
create index lucia_drafts_pending_idx on public.lucia_drafts(company_id,business_unit_id) where status='pending';
alter table public.lucia_messages add constraint lucia_messages_draft_fk foreign key(draft_id) references public.lucia_drafts(id);

create table public.lucia_usage_daily(
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 usage_date date not null,
 requests integer not null default 0,
 input_tokens bigint not null default 0,
 output_tokens bigint not null default 0,
 cache_read_tokens bigint not null default 0,
 cache_write_tokens bigint not null default 0,
 cost_usd numeric(12,6) not null default 0,
 updated_at timestamptz not null default now(),
 primary key(company_id,usage_date),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);

create table public.lucia_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid references public.lucia_conversations(id),
 severity text not null default 'info' check(severity in('info','warning','error')),
 event_type text not null check(event_type ~ '^[a-z_]{3,60}$'),
 message text not null check(length(message)<=2000),
 context jsonb not null default '{}',
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lucia_events_time_idx on public.lucia_events(company_id,created_at desc);
create index lucia_events_conversation_idx on public.lucia_events(conversation_id,created_at desc) where conversation_id is not null;

-- Credenciales de la sesión de WhatsApp (Baileys). Solo service_role: sin
-- policies ni grants para usuarios del ERP.
create table public.lucia_wa_auth(
 company_id uuid not null references public.companies(id),
 key text not null check(length(key) between 1 and 300),
 value jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(company_id,key)
);

create trigger audit_lucia_settings after insert or update or delete on public.lucia_settings for each row execute function public.audit_row_change();
create trigger audit_lucia_hostels after insert or update or delete on public.lucia_hostels for each row execute function public.audit_row_change();
create trigger audit_lucia_excluded_contacts after insert or update or delete on public.lucia_excluded_contacts for each row execute function public.audit_row_change();
create trigger audit_lucia_conversations after insert or update on public.lucia_conversations for each row execute function public.audit_row_change();
create trigger audit_lucia_drafts after update on public.lucia_drafts for each row execute function public.audit_row_change();

create or replace function public.lucia_touch_conversation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.lucia_conversations set
   last_message_at=new.created_at,
   last_inbound_at=case when new.direction='inbound' then new.created_at else last_inbound_at end,
   last_outbound_at=case when new.direction='outbound' then new.created_at else last_outbound_at end,
   unanswered_since=case when new.direction='inbound' then coalesce(unanswered_since,new.created_at) else null end,
   updated_at=now()
 where id=new.conversation_id;
 return new;
end $$;
create trigger lucia_messages_touch after insert on public.lucia_messages for each row execute function public.lucia_touch_conversation();

-- ===== Lectura de acceso =====

-- Usuario con acceso a alguna hostal de Lucía de la empresa: puede ver las
-- conversaciones que todavía no tienen hostal asignada.
create or replace function public.lucia_can_view_unassigned(target_company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lucia_hostels h where h.company_id=target_company and public.can_access_unit(h.company_id,h.business_unit_id))
$$;

create or replace function public.lucia_can_access_conversation(c public.lucia_conversations) returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('lucia.inbox.view') and (
   public.can_access_unit(c.company_id,c.business_unit_id)
   or (not c.hostel_assigned and public.lucia_can_view_unassigned(c.company_id))
 )
$$;

alter table public.lucia_settings enable row level security;
alter table public.lucia_hostels enable row level security;
alter table public.lucia_excluded_contacts enable row level security;
alter table public.lucia_conversations enable row level security;
alter table public.lucia_messages enable row level security;
alter table public.lucia_drafts enable row level security;
alter table public.lucia_usage_daily enable row level security;
alter table public.lucia_events enable row level security;
alter table public.lucia_wa_auth enable row level security;

create policy lucia_settings_read on public.lucia_settings for select to authenticated using(
 public.can_access_company(company_id) and (public.has_permission('lucia.settings.manage') or public.has_permission('lucia.inbox.view'))
);
create policy lucia_settings_update on public.lucia_settings for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
) with check(public.can_access_unit(company_id,business_unit_id));

create policy lucia_hostels_read on public.lucia_hostels for select to authenticated using(
 public.can_access_company(company_id) and (public.has_permission('lucia.settings.manage') or public.has_permission('lucia.inbox.view'))
);
create policy lucia_hostels_update on public.lucia_hostels for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
) with check(public.can_access_unit(company_id,business_unit_id));

create policy lucia_excluded_read on public.lucia_excluded_contacts for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
);
create policy lucia_excluded_insert on public.lucia_excluded_contacts for insert to authenticated with check(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
 and business_unit_id=(select s.business_unit_id from public.lucia_settings s where s.company_id=lucia_excluded_contacts.company_id)
);
create policy lucia_excluded_delete on public.lucia_excluded_contacts for delete to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
);

create policy lucia_conversations_read on public.lucia_conversations for select to authenticated using(
 public.lucia_can_access_conversation(lucia_conversations)
);
create policy lucia_messages_read on public.lucia_messages for select to authenticated using(
 exists(select 1 from public.lucia_conversations c where c.id=conversation_id and public.lucia_can_access_conversation(c))
);
create policy lucia_drafts_read on public.lucia_drafts for select to authenticated using(
 exists(select 1 from public.lucia_conversations c where c.id=conversation_id and public.lucia_can_access_conversation(c))
);
create policy lucia_usage_read on public.lucia_usage_daily for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
);
create policy lucia_events_read on public.lucia_events for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.settings.manage')
);

-- Columnas editables desde el ERP: las de conexión quedan solo para service_role.
grant select(id,company_id,business_unit_id,agent_name,general_instructions,model,daily_budget_usd,max_messages_per_minute,history_messages,
 budget_exceeded_on,connection_status,qr_updated_at,connected_phone,worker_heartbeat_at,last_connection_error,created_at,updated_at,updated_by)
 on public.lucia_settings to authenticated;
grant update(agent_name,general_instructions,model,daily_budget_usd,max_messages_per_minute,history_messages,updated_at,updated_by) on public.lucia_settings to authenticated;
grant select on public.lucia_hostels to authenticated;
grant update(display_name,manual,manager_name,manager_phone,mode,enabled,updated_at,updated_by) on public.lucia_hostels to authenticated;
grant select,insert,delete on public.lucia_excluded_contacts to authenticated;
grant select on public.lucia_conversations,public.lucia_messages,public.lucia_drafts,public.lucia_usage_daily,public.lucia_events to authenticated;
grant select,insert,update,delete on public.lucia_settings,public.lucia_hostels,public.lucia_excluded_contacts,public.lucia_conversations,
 public.lucia_messages,public.lucia_drafts,public.lucia_usage_daily,public.lucia_events,public.lucia_wa_auth to service_role;

-- ===== Funciones internas =====

create or replace function public.lucia_log(target_company uuid,target_conversation uuid,sev text,etype text,msg text,ctx jsonb) returns void language plpgsql security definer set search_path='' as $$
declare home uuid;
begin
 select business_unit_id into home from public.lucia_settings where company_id=target_company;
 if home is null then return; end if;
 insert into public.lucia_events(company_id,business_unit_id,conversation_id,severity,event_type,message,context)
 values(target_company,home,target_conversation,sev,etype,left(msg,2000),coalesce(ctx,'{}'::jsonb));
end $$;
revoke execute on function public.lucia_log(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.lucia_notify_managers(target_company uuid,ekey text,ttl text,msg text,etype text,eid uuid) returns void language plpgsql security definer set search_path='' as $$
declare home uuid;
begin
 select business_unit_id into home from public.lucia_settings where company_id=target_company;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select target_company,home,p.id,ekey,ttl,msg,etype,eid,null
 from public.profiles p
 join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=target_company and ubu.business_unit_id=home
 where p.active and p.deleted_at is null
  and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=p.role_id and perm.key='lucia.settings.manage' and perm.active)
  and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.event_key=ekey and n.entity_id is not distinct from eid and n.status='unread');
end $$;
revoke execute on function public.lucia_notify_managers(uuid,text,text,text,text,uuid) from public,anon,authenticated;

-- Lucía y el equipo comparten un solo flujo de envío: WhatsApp queda en cola
-- para el worker; el simulador se marca enviado al instante.
create or replace function public.lucia_enqueue_outbound(c public.lucia_conversations,sender text,sender_user uuid,body text,source_draft uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
 if nullif(trim(body),'') is null then raise exception 'El mensaje no puede estar vacío'; end if;
 if length(body)>4000 then raise exception 'El mensaje es demasiado largo'; end if;
 if c.status='closed' then raise exception 'La conversación está cerrada'; end if;
 insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,sender_user_id,message_type,content,delivery_status,draft_id,sent_at)
 values(c.company_id,c.business_unit_id,c.id,'outbound',sender,sender_user,'text',trim(body),
   case when c.channel='simulator' then 'sent' else 'queued' end,source_draft,
   case when c.channel='simulator' then now() end)
 returning id into mid;
 return mid;
end $$;
revoke execute on function public.lucia_enqueue_outbound(public.lucia_conversations,text,uuid,text,uuid) from public,anon,authenticated;

-- ===== Funciones service_role (worker y procesamiento de IA) =====

-- Registra un mensaje que llegó al número central (o que el equipo escribió
-- desde el teléfono). company_id viene del worker, que lo lee de
-- lucia_settings con la clave de servicio.
create or replace function public.lucia_ingest_message(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.lucia_settings;
 conv public.lucia_conversations;
 mid uuid;
 jid text:=nullif(trim(payload->>'jid'),'');
 phone text:=nullif(trim(payload->>'phone'),'');
 ext text:=nullif(trim(payload->>'external_id'),'');
 mtype text:=coalesce(nullif(payload->>'message_type',''),'text');
 body text:=nullif(payload->>'content','');
 pname text:=nullif(trim(payload->>'push_name'),'');
 from_me boolean:=coalesce((payload->>'from_me')::boolean,false);
begin
 select * into s from public.lucia_settings where company_id=nullif(payload->>'company_id','')::uuid;
 if not found then return jsonb_build_object('status','not_configured'); end if;
 if jid is null then raise exception 'Falta el identificador del chat'; end if;
 if phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$' then phone:=null; end if;
 if mtype not in('text','audio','image','video','document','sticker','location','contact','other') then mtype:='other'; end if;

 if phone is not null and exists(select 1 from public.lucia_excluded_contacts e where e.company_id=s.company_id and e.phone_e164=phone) then
   return jsonb_build_object('status','excluded');
 end if;
 if ext is not null and exists(select 1 from public.lucia_messages m where m.company_id=s.company_id and m.external_id=ext) then
   return jsonb_build_object('status','duplicate');
 end if;

 insert into public.lucia_conversations(company_id,business_unit_id,channel,contact_jid,contact_phone,contact_name)
 values(s.company_id,s.business_unit_id,'whatsapp',jid,phone,case when from_me then null else pname end)
 on conflict(company_id,channel,contact_jid) where status<>'closed'
 do update set contact_phone=coalesce(public.lucia_conversations.contact_phone,excluded.contact_phone),
   contact_name=coalesce(public.lucia_conversations.contact_name,excluded.contact_name),updated_at=now()
 returning * into conv;

 insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,message_type,content,external_id,delivery_status,sent_at)
 values(conv.company_id,conv.business_unit_id,conv.id,
   case when from_me then 'outbound' else 'inbound' end,
   case when from_me then 'human' else 'customer' end,
   mtype,left(body,8000),ext,case when from_me then 'sent' else 'received' end,case when from_me then now() end)
 on conflict(company_id,external_id) where external_id is not null do nothing
 returning id into mid;
 if mid is null then return jsonb_build_object('status','duplicate','conversation_id',conv.id); end if;

 if from_me then
   -- Alguien del equipo escribió desde el teléfono: Lucía se pausa 12 h
   -- en este chat y se descartan sus borradores pendientes.
   update public.lucia_conversations set paused_until=now()+interval '12 hours',pause_reason='El equipo respondió desde el teléfono',updated_at=now() where id=conv.id;
   update public.lucia_drafts set status='superseded' where conversation_id=conv.id and status='pending';
   return jsonb_build_object('status','team_message','conversation_id',conv.id,'message_id',mid,'process',false);
 end if;

 if mtype<>'text' then
   update public.lucia_conversations set needs_review=true,
     review_reason=case mtype when 'audio' then 'Audio: requiere revisión humana' when 'image' then 'Imagen: requiere revisión humana' else 'Archivo o mensaje no textual: requiere revisión humana' end,
     updated_at=now() where id=conv.id;
   return jsonb_build_object('status','needs_review','conversation_id',conv.id,'message_id',mid,'process',false);
 end if;

 return jsonb_build_object('status','ok','conversation_id',conv.id,'message_id',mid,
   'process',conv.status='lucia' and (conv.paused_until is null or conv.paused_until<now()));
end $$;
revoke execute on function public.lucia_ingest_message(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_ingest_message(jsonb) to service_role;

-- Suma el consumo de una llamada a Claude. Si el gasto del día supera el
-- tope, Lucía queda en modo borrador hasta mañana y se avisa a quienes
-- administran Lucía.
create or replace function public.lucia_record_usage(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lucia_settings; total numeric; today date:=(now() at time zone 'America/Santiago')::date;
begin
 select * into strict s from public.lucia_settings where company_id=nullif(payload->>'company_id','')::uuid for update;
 insert into public.lucia_usage_daily(company_id,business_unit_id,usage_date,requests,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd)
 values(s.company_id,s.business_unit_id,today,1,coalesce((payload->>'input_tokens')::bigint,0),coalesce((payload->>'output_tokens')::bigint,0),
   coalesce((payload->>'cache_read_tokens')::bigint,0),coalesce((payload->>'cache_write_tokens')::bigint,0),coalesce((payload->>'cost_usd')::numeric,0))
 on conflict(company_id,usage_date) do update set
   requests=public.lucia_usage_daily.requests+1,
   input_tokens=public.lucia_usage_daily.input_tokens+excluded.input_tokens,
   output_tokens=public.lucia_usage_daily.output_tokens+excluded.output_tokens,
   cache_read_tokens=public.lucia_usage_daily.cache_read_tokens+excluded.cache_read_tokens,
   cache_write_tokens=public.lucia_usage_daily.cache_write_tokens+excluded.cache_write_tokens,
   cost_usd=public.lucia_usage_daily.cost_usd+excluded.cost_usd,
   updated_at=now()
 returning cost_usd into total;
 if total>=s.daily_budget_usd and s.budget_exceeded_on is distinct from today then
   update public.lucia_settings set budget_exceeded_on=today where id=s.id;
   perform public.lucia_log(s.company_id,null,'warning','budget_exceeded',format('Se superó el tope diario de US$ %s (gasto: US$ %s). Lucía queda en modo borrador hasta mañana.',s.daily_budget_usd,round(total,4)),'{}');
   perform public.lucia_notify_managers(s.company_id,'lucia.budget_exceeded','Lucía superó el tope de gasto diario',
     format('El gasto de hoy llegó a US$ %s (tope US$ %s). Lucía queda en modo borrador hasta mañana.',round(total,2),s.daily_budget_usd),'lucia_settings',s.id);
 end if;
 return jsonb_build_object('today_cost_usd',total,'over_budget',total>=s.daily_budget_usd);
end $$;
revoke execute on function public.lucia_record_usage(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_record_usage(jsonb) to service_role;

-- Guarda el borrador de Lucía y actualiza la ficha con los datos que
-- extrajo. Solo completa o corrige campos con valores nuevos: nunca borra
-- lo que ya estaba y nunca toca reservas.
create or replace function public.lucia_record_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 c public.lucia_conversations;
 p jsonb:=coalesce(payload->'extracted','{}'::jsonb);
 hostel_unit uuid;
 did uuid;
 cin date; cout date; amount numeric;
begin
 select * into strict c from public.lucia_conversations where id=nullif(payload->>'conversation_id','')::uuid for update;
 if c.status='closed' then raise exception 'La conversación está cerrada'; end if;

 if nullif(p->>'hostel_code','') is not null then
   select h.business_unit_id into hostel_unit from public.lucia_hostels h join public.business_units bu on bu.id=h.business_unit_id
   where h.company_id=c.company_id and bu.code=p->>'hostel_code' and h.enabled;
 end if;
 begin cin:=nullif(p->>'check_in','')::date; exception when others then cin:=null; end;
 begin cout:=nullif(p->>'check_out','')::date; exception when others then cout:=null; end;
 cin:=coalesce(cin,c.check_in);
 cout:=coalesce(cout,c.check_out);
 if cin is not null and cout is not null and cout<=cin then cout:=null; end if;
 begin amount:=nullif(p->>'quoted_amount','')::numeric; exception when others then amount:=null; end;
 if amount is not null and amount<0 then amount:=null; end if;

 if hostel_unit is not null and hostel_unit<>c.business_unit_id then
   update public.lucia_messages set business_unit_id=hostel_unit where conversation_id=c.id;
   update public.lucia_drafts set business_unit_id=hostel_unit where conversation_id=c.id;
 end if;

 update public.lucia_drafts set status='superseded' where conversation_id=c.id and status='pending';

 update public.lucia_conversations set
   business_unit_id=coalesce(hostel_unit,business_unit_id),
   hostel_assigned=hostel_assigned or hostel_unit is not null,
   guest_name=coalesce(left(nullif(trim(p->>'guest_name'),''),160),guest_name),
   check_in=cin,
   check_out=cout,
   guests=coalesce(case when (p->>'guests') ~ '^[0-9]{1,2}$' and (p->>'guests')::int between 1 and 60 then (p->>'guests')::smallint end,guests),
   room_type=coalesce(left(nullif(trim(p->>'room_type'),''),120),room_type),
   preferences=coalesce(left(nullif(trim(p->>'preferences'),''),500),preferences),
   quoted_amount=coalesce(amount,quoted_amount),
   quoted_at=case when amount is not null then now() else quoted_at end,
   prospect_status=case when amount is not null and prospect_status='new' then 'quoted' else prospect_status end,
   needs_review=needs_review or coalesce((payload->>'needs_human')::boolean,false),
   review_reason=case when coalesce((payload->>'needs_human')::boolean,false) and not needs_review then left(coalesce(nullif(payload->>'reason',''),'Lucía pide revisión humana'),300) else review_reason end,
   updated_at=now()
 where id=c.id;

 insert into public.lucia_drafts(company_id,business_unit_id,conversation_id,content,intent,needs_human,reason,extracted,model,
   input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd)
 values(c.company_id,coalesce(hostel_unit,c.business_unit_id),c.id,left(trim(payload->>'content'),4000),
   left(coalesce(nullif(payload->>'intent',''),'other'),40),coalesce((payload->>'needs_human')::boolean,false),
   left(nullif(payload->>'reason',''),300),p,left(nullif(payload->>'model',''),80),
   coalesce((payload->>'input_tokens')::int,0),coalesce((payload->>'output_tokens')::int,0),
   coalesce((payload->>'cache_read_tokens')::int,0),coalesce((payload->>'cache_write_tokens')::int,0),
   coalesce((payload->>'cost_usd')::numeric,0))
 returning id into did;
 return did;
end $$;
revoke execute on function public.lucia_record_draft(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_record_draft(jsonb) to service_role;

create or replace function public.lucia_record_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.lucia_log(nullif(payload->>'company_id','')::uuid,nullif(payload->>'conversation_id','')::uuid,
   coalesce(nullif(payload->>'severity',''),'info'),coalesce(nullif(payload->>'event_type',''),'worker_event'),
   coalesce(payload->>'message',''),coalesce(payload->'context','{}'::jsonb));
end $$;
revoke execute on function public.lucia_record_event(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_record_event(jsonb) to service_role;

-- Estado de la conexión reportado por el worker (QR, conectado, error, latido).
create or replace function public.lucia_worker_status(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare st text:=nullif(payload->>'status','');
begin
 update public.lucia_settings set
   connection_status=coalesce(st,connection_status),
   qr_code=case when st='qr_pending' then nullif(payload->>'qr','') when st is not null then null else qr_code end,
   qr_updated_at=case when st='qr_pending' then now() else qr_updated_at end,
   connected_phone=case when st='connected' then coalesce(nullif(payload->>'phone',''),connected_phone) when st='disconnected' then null else connected_phone end,
   last_connection_error=case when st='error' then left(payload->>'error',500) when st='connected' then null else last_connection_error end,
   worker_heartbeat_at=now()
 where company_id=nullif(payload->>'company_id','')::uuid;
end $$;
revoke execute on function public.lucia_worker_status(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_worker_status(jsonb) to service_role;

-- El worker toma el próximo mensaje en cola respetando el límite por minuto.
create or replace function public.lucia_claim_outbound(target_company uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lucia_settings; m public.lucia_messages; recent integer; jid text;
begin
 select * into strict s from public.lucia_settings where company_id=target_company;
 if s.connection_status<>'connected' then return null; end if;
 select count(*) into recent from public.lucia_messages lm join public.lucia_conversations lc on lc.id=lm.conversation_id
 where lm.company_id=target_company and lc.channel='whatsapp' and lm.direction='outbound'
   and lm.sender_type in('lucia','human') and lm.sent_at>now()-interval '1 minute' and lm.delivery_status in('sent','sending');
 if recent>=s.max_messages_per_minute then return null; end if;
 -- Un mensaje que quedó "enviando" por más de 2 minutos (worker caído) vuelve a la cola.
 update public.lucia_messages set delivery_status='queued' where company_id=target_company and delivery_status='sending' and sent_at<now()-interval '2 minutes';
 select * into m from public.lucia_messages where company_id=target_company and delivery_status='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if m.attempts>=3 then
   update public.lucia_messages set delivery_status='failed',error_message=coalesce(error_message,'Se agotaron los reintentos') where id=m.id;
   return null;
 end if;
 select contact_jid into jid from public.lucia_conversations where id=m.conversation_id;
 update public.lucia_messages set delivery_status='sending',attempts=attempts+1,sent_at=now() where id=m.id;
 return jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'jid',jid,'content',m.content);
end $$;
revoke execute on function public.lucia_claim_outbound(uuid) from public,anon,authenticated;
grant execute on function public.lucia_claim_outbound(uuid) to service_role;

create or replace function public.lucia_mark_outbound(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.lucia_messages; ok boolean:=coalesce((payload->>'ok')::boolean,false);
begin
 select * into strict m from public.lucia_messages where id=nullif(payload->>'id','')::uuid for update;
 update public.lucia_messages set
   delivery_status=case when ok then 'sent' when m.attempts>=3 then 'failed' else 'queued' end,
   external_id=coalesce(nullif(payload->>'external_id',''),external_id),
   error_message=case when ok then null else left(payload->>'error',500) end,
   sent_at=case when ok then now() else sent_at end
 where id=m.id;
 if not ok then
   perform public.lucia_log(m.company_id,m.conversation_id,'error','send_failed',coalesce(payload->>'error','No se pudo enviar el mensaje'),jsonb_build_object('message_id',m.id,'attempts',m.attempts));
 end if;
end $$;
revoke execute on function public.lucia_mark_outbound(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_mark_outbound(jsonb) to service_role;

-- ===== Funciones para usuarios del ERP =====

create or replace function public.lucia_conversation_for_reply(target_conversation uuid) returns public.lucia_conversations language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 if not public.has_permission('lucia.inbox.reply') then raise exception 'Sin autorización'; end if;
 select * into c from public.lucia_conversations where id=target_conversation for update;
 if not found or not public.lucia_can_access_conversation(c) then raise exception 'Conversación no autorizada'; end if;
 return c;
end $$;
revoke execute on function public.lucia_conversation_for_reply(uuid) from public,anon,authenticated;

-- "Enviar" o "Editar y enviar" un borrador de Lucía.
create or replace function public.lucia_send_draft(target_draft uuid,final_content text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.lucia_drafts; c public.lucia_conversations; mid uuid; body text:=trim(coalesce(final_content,''));
begin
 select * into d from public.lucia_drafts where id=target_draft for update;
 if not found then raise exception 'Borrador no encontrado'; end if;
 c:=public.lucia_conversation_for_reply(d.conversation_id);
 if d.status<>'pending' then raise exception 'Este borrador ya fue enviado, descartado o reemplazado'; end if;
 if body='' then body:=d.content; end if;
 mid:=public.lucia_enqueue_outbound(c,'lucia',auth.uid(),body,d.id);
 update public.lucia_drafts set status='sent',edited=body<>d.content,decided_by=auth.uid(),decided_at=now(),sent_message_id=mid where id=d.id;
 return mid;
end $$;

create or replace function public.lucia_discard_draft(target_draft uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.lucia_drafts; c public.lucia_conversations;
begin
 select * into d from public.lucia_drafts where id=target_draft for update;
 if not found then raise exception 'Borrador no encontrado'; end if;
 c:=public.lucia_conversation_for_reply(d.conversation_id);
 if d.status<>'pending' then raise exception 'Este borrador ya no está pendiente'; end if;
 update public.lucia_drafts set status='discarded',decided_by=auth.uid(),decided_at=now() where id=d.id;
end $$;

-- Respuesta escrita por una persona desde la bandeja, por el número central.
create or replace function public.lucia_send_reply(target_conversation uuid,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; mid uuid;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 mid:=public.lucia_enqueue_outbound(c,'human',auth.uid(),body,null);
 update public.lucia_drafts set status='superseded' where conversation_id=c.id and status='pending';
 return mid;
end $$;

create or replace function public.lucia_take_control(target_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if c.status='closed' then raise exception 'La conversación está cerrada'; end if;
 update public.lucia_conversations set status='human',taken_by=auth.uid(),taken_at=now(),updated_at=now() where id=c.id;
 update public.lucia_drafts set status='superseded' where conversation_id=c.id and status='pending';
end $$;

create or replace function public.lucia_release_control(target_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if c.status='closed' then raise exception 'La conversación está cerrada'; end if;
 update public.lucia_conversations set status='lucia',taken_by=null,taken_at=null,paused_until=null,pause_reason=null,updated_at=now() where id=c.id;
end $$;

create or replace function public.lucia_mark_reviewed(target_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 update public.lucia_conversations set needs_review=false,review_reason=null,updated_at=now() where id=c.id;
end $$;

create or replace function public.lucia_close_conversation(target_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if c.status='closed' then raise exception 'La conversación ya está cerrada'; end if;
 update public.lucia_conversations set status='closed',closed_at=now(),updated_at=now() where id=c.id;
 update public.lucia_drafts set status='superseded' where conversation_id=c.id and status='pending';
end $$;

-- Corrección manual de la ficha del prospecto. La hostal solo puede ser una
-- de Lucía a la que el usuario tenga acceso.
create or replace function public.lucia_update_prospect(target_conversation uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; unit uuid; st text:=nullif(payload->>'prospect_status','');
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if st is not null and st not in('new','quoted','pre_reserved','confirmed','lost') then raise exception 'Estado inválido'; end if;
 if nullif(payload->>'business_unit_id','') is not null then
   unit:=(payload->>'business_unit_id')::uuid;
   if not exists(select 1 from public.lucia_hostels h where h.company_id=c.company_id and h.business_unit_id=unit)
     or not public.can_access_unit(c.company_id,unit) then raise exception 'Hostal no autorizada'; end if;
   if unit<>c.business_unit_id then
     update public.lucia_messages set business_unit_id=unit where conversation_id=c.id;
     update public.lucia_drafts set business_unit_id=unit where conversation_id=c.id;
   end if;
 end if;
 update public.lucia_conversations set
   business_unit_id=coalesce(unit,business_unit_id),
   hostel_assigned=hostel_assigned or unit is not null,
   prospect_status=coalesce(st,prospect_status),
   guest_name=case when payload ? 'guest_name' then left(nullif(trim(payload->>'guest_name'),''),160) else guest_name end,
   contact_name=case when payload ? 'contact_name' then left(nullif(trim(payload->>'contact_name'),''),160) else contact_name end,
   check_in=case when payload ? 'check_in' then nullif(payload->>'check_in','')::date else check_in end,
   check_out=case when payload ? 'check_out' then nullif(payload->>'check_out','')::date else check_out end,
   guests=case when payload ? 'guests' then nullif(payload->>'guests','')::smallint else guests end,
   room_type=case when payload ? 'room_type' then left(nullif(trim(payload->>'room_type'),''),120) else room_type end,
   preferences=case when payload ? 'preferences' then left(nullif(trim(payload->>'preferences'),''),500) else preferences end,
   quoted_amount=case when payload ? 'quoted_amount' then nullif(payload->>'quoted_amount','')::numeric else quoted_amount end,
   quoted_at=case when payload ? 'quoted_amount' and nullif(payload->>'quoted_amount','') is not null and quoted_amount is distinct from nullif(payload->>'quoted_amount','')::numeric then now() else quoted_at end,
   updated_at=now()
 where id=c.id;
end $$;

-- El QR permite vincular el número central: solo lo ve quien administra Lucía.
create or replace function public.lucia_connection_qr() returns text language plpgsql stable security definer set search_path='' as $$
declare s public.lucia_settings;
begin
 if not public.has_permission('lucia.settings.manage') then raise exception 'Sin autorización'; end if;
 select * into s from public.lucia_settings where public.can_access_unit(company_id,business_unit_id) limit 1;
 if not found or s.connection_status<>'qr_pending' then return null; end if;
 return s.qr_code;
end $$;

-- ===== Simulador (etapa 1): conversaciones de prueba sin WhatsApp =====

create or replace function public.lucia_simulator_start(contact text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.lucia_settings; cid uuid;
begin
 if not public.has_permission('lucia.settings.manage') then raise exception 'Sin autorización'; end if;
 select * into s from public.lucia_settings where public.can_access_unit(company_id,business_unit_id) limit 1;
 if not found then raise exception 'Lucía no está configurada para tu empresa'; end if;
 insert into public.lucia_conversations(company_id,business_unit_id,channel,contact_jid,contact_name,created_by)
 values(s.company_id,s.business_unit_id,'simulator','sim:'||gen_random_uuid(),coalesce(left(nullif(trim(contact),''),160),'Cliente de prueba'),auth.uid())
 returning id into cid;
 return cid;
end $$;

create or replace function public.lucia_simulator_customer_message(target_conversation uuid,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; mid uuid;
begin
 if not public.has_permission('lucia.settings.manage') then raise exception 'Sin autorización'; end if;
 select * into c from public.lucia_conversations where id=target_conversation for update;
 if not found or c.channel<>'simulator' or not public.lucia_can_access_conversation(c) then raise exception 'Conversación de prueba no encontrada'; end if;
 if c.status='closed' then raise exception 'La conversación está cerrada'; end if;
 if nullif(trim(body),'') is null then raise exception 'El mensaje no puede estar vacío'; end if;
 insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,message_type,content,delivery_status)
 values(c.company_id,c.business_unit_id,c.id,'inbound','customer','text',left(trim(body),4000),'received')
 returning id into mid;
 return mid;
end $$;

grant execute on function
 public.lucia_send_draft(uuid,text),
 public.lucia_discard_draft(uuid),
 public.lucia_send_reply(uuid,text),
 public.lucia_take_control(uuid),
 public.lucia_release_control(uuid),
 public.lucia_mark_reviewed(uuid),
 public.lucia_close_conversation(uuid),
 public.lucia_update_prospect(uuid,jsonb),
 public.lucia_simulator_start(text),
 public.lucia_simulator_customer_message(uuid,text),
 public.lucia_connection_qr()
to authenticated;
revoke execute on function
 public.lucia_send_draft(uuid,text),
 public.lucia_discard_draft(uuid),
 public.lucia_send_reply(uuid,text),
 public.lucia_take_control(uuid),
 public.lucia_release_control(uuid),
 public.lucia_mark_reviewed(uuid),
 public.lucia_close_conversation(uuid),
 public.lucia_update_prospect(uuid,jsonb),
 public.lucia_simulator_start(text),
 public.lucia_simulator_customer_message(uuid,text),
 public.lucia_connection_qr()
from public,anon;

-- ===== Semilla: Lucía con base en Hostal Uruguay y las tres hostales =====
insert into public.lucia_settings(company_id,business_unit_id,general_instructions)
select bu.company_id,bu.id,
 'Eres Lucía, la asistente de reservas de nuestras tres hostales. Respondes en español, con tono cercano y breve, como una persona por WhatsApp.'
from public.business_units bu where bu.code='HU' and bu.deleted_at is null
on conflict(company_id) do nothing;

insert into public.lucia_hostels(company_id,business_unit_id,display_name)
select bu.company_id,bu.id,bu.name from public.business_units bu
where bu.code in('HU','HOC','HOB') and bu.deleted_at is null
 and exists(select 1 from public.lucia_settings s where s.company_id=bu.company_id)
on conflict(business_unit_id) do nothing;

commit;
