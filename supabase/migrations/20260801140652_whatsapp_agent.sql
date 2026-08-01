begin;

-- Agente comercial de WhatsApp para Oasis Modulares (unidad OM). El numero
-- de WhatsApp pertenece exclusivamente a esta unidad: la integracion
-- (whatsapp_integrations) resuelve company_id/business_unit_id a partir del
-- numero receptor del webhook -- nunca se acepta un company_id enviado por
-- el cliente. Ninguna tabla de este modulo almacena tokens/secretos de
-- Twilio o Meta; esos viven solo en variables de entorno del servidor.
-- crm_leads usa un nombre agnostico al canal (no whatsapp_leads) porque a
-- futuro puede alimentarse tambien desde web o carga manual.

insert into public.permissions(key,module,description) values
 ('whatsapp.inbox.view','whatsapp','Ver la bandeja de conversaciones de WhatsApp'),
 ('whatsapp.inbox.reply','whatsapp','Responder manualmente, tomar y cerrar conversaciones'),
 ('whatsapp.conversations.assign','whatsapp','Asignar conversaciones a otros vendedores'),
 ('whatsapp.agent.control','whatsapp','Pausar o reactivar el agente IA en una conversacion'),
 ('whatsapp.leads.view','whatsapp','Ver leads comerciales'),
 ('whatsapp.leads.manage','whatsapp','Crear y editar leads comerciales'),
 ('whatsapp.settings.manage','whatsapp','Configurar la integracion de WhatsApp')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='seller' and p.key in(
 'whatsapp.inbox.view','whatsapp.inbox.reply','whatsapp.agent.control','whatsapp.leads.view','whatsapp.leads.manage'
) on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in('operations_manager','general_manager','area_manager') and p.key in(
 'whatsapp.inbox.view','whatsapp.inbox.reply','whatsapp.conversations.assign','whatsapp.agent.control','whatsapp.leads.view','whatsapp.leads.manage'
) on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='general_manager' and p.key='whatsapp.settings.manage'
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='superadmin' and p.key like 'whatsapp.%'
on conflict do nothing;

create table public.whatsapp_integrations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 provider text not null check(provider in('twilio','meta')),
 phone_number_e164 text not null check(phone_number_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 display_name text,
 enabled boolean not null default true,
 automation_enabled boolean not null default true,
 agent_name text not null default 'Asistente Oasis',
 fallback_message text not null default 'Gracias por escribir a Oasis Modulares. En breve un vendedor te va a responder.',
 business_hours jsonb not null default '{}',
 connection_status text not null default 'unknown' check(connection_status in('unknown','ok','error')),
 last_webhook_at timestamptz,last_connection_check_at timestamptz,last_connection_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(provider,phone_number_e164),
 unique(company_id,business_unit_id,provider)
);
comment on table public.whatsapp_integrations is 'Config por numero de WhatsApp. Nunca almacena tokens/secretos: esos viven solo en variables de entorno del servidor.';

create table public.crm_leads(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 phone_e164 text not null check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 full_name text,
 channel text not null default 'whatsapp' check(channel in('whatsapp','manual','web')),
 city text,
 product_interest text check(product_interest in('casa','oficina','bano','otro')),
 bedrooms smallint check(bedrooms>=0 and bedrooms<=20),
 bathrooms smallint check(bathrooms>=0 and bathrooms<=20),
 surface_m2 numeric(8,2) check(surface_m2>=0),
 budget_clp numeric(14,2) check(budget_clp>=0),
 requires_transport boolean,requires_installation boolean,
 estimated_date date,
 status text not null default 'new' check(status in('new','contacted','qualifying','qualified','quotation_requested','won','lost','discarded')),
 assigned_user_id uuid references public.profiles(id),
 source_notes text,
 last_interaction_at timestamptz,
 created_via text not null default 'agent' check(created_via in('agent','user')),
 -- created_by es la unica excepcion en el repo a "not null references
 -- profiles(id)": el agente de WhatsApp crea leads sin usuario detras.
 -- created_via distingue el origen y la auditoria (audit_row_change)
 -- registra igual el cambio con actor_id null.
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create unique index crm_leads_phone_idx on public.crm_leads(company_id,phone_e164) where deleted_at is null;
create index crm_leads_status_idx on public.crm_leads(company_id,business_unit_id,status);
create index crm_leads_assigned_idx on public.crm_leads(assigned_user_id,last_interaction_at desc);

create table public.whatsapp_conversations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,business_unit_id uuid not null,
 integration_id uuid not null references public.whatsapp_integrations(id),
 lead_id uuid not null references public.crm_leads(id),
 provider text not null,
 external_conversation_id text,
 status text not null default 'ai_active' check(status in('ai_active','human_required','human_active','paused','closed')),
 requires_human boolean not null default false,
 assigned_user_id uuid references public.profiles(id),
 ai_paused_reason text,
 ai_pending_since timestamptz,
 last_message_at timestamptz,last_inbound_at timestamptz,last_outbound_at timestamptz,
 message_count integer not null default 0,
 closed_at timestamptz,closed_by uuid references public.profiles(id),close_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(status<>'closed' or closed_at is not null),
 check(status<>'human_active' or assigned_user_id is not null)
);
-- A lo mas una conversacion abierta por lead dentro de una misma
-- integracion; el mismo indice se usa como arbitro de ON CONFLICT en
-- whatsapp_ingest_inbound_message.
create unique index whatsapp_conversations_open_idx on public.whatsapp_conversations(integration_id,lead_id) where status<>'closed';
create index whatsapp_conversations_unit_idx on public.whatsapp_conversations(company_id,business_unit_id,status);
create index whatsapp_conversations_assigned_idx on public.whatsapp_conversations(assigned_user_id,last_message_at desc);

create table public.whatsapp_messages(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,business_unit_id uuid not null,
 conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
 provider text not null,
 external_message_id text,
 direction text not null check(direction in('inbound','outbound')),
 sender_type text not null check(sender_type in('customer','ai','human','system')),
 sender_user_id uuid references public.profiles(id),
 message_type text not null default 'text' check(message_type in('text','image','audio','document','location','template','unsupported')),
 content text check(content is null or length(content)<=8000),
 payload jsonb not null default '{}',
 delivery_status text not null default 'received' check(delivery_status in('received','queued','sent','delivered','read','failed')),
 error_message text,
 ai_model text,ai_intent text,
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
-- Idempotencia: un mismo MessageSid de Twilio nunca se procesa dos veces.
-- Sin trigger de auditoria en esta tabla -- el mensaje ya es el registro
-- historico, duplicarlo en audit_logs solo infla la bitacora.
create unique index whatsapp_messages_external_idx on public.whatsapp_messages(provider,external_message_id) where external_message_id is not null;
create index whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id,created_at);
create index whatsapp_messages_unit_direction_idx on public.whatsapp_messages(company_id,direction,created_at desc);

create table public.whatsapp_integration_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid references public.companies(id),
 integration_id uuid references public.whatsapp_integrations(id),
 event_type text not null check(event_type in('invalid_signature','unknown_number','disabled','parse_error','duplicate_message','rate_limited','provider_error','ai_error','ai_invalid_output','opt_out','manual_test')),
 severity text not null default 'info' check(severity in('info','warning','error')),
 message text not null,
 context jsonb not null default '{}',
 created_at timestamptz not null default now()
);
comment on table public.whatsapp_integration_events is 'Bitacora tecnica del webhook. Eventos sin company_id resuelto (firma invalida, numero desconocido) tambien se duplican en audit_logs para no quedar invisibles bajo RLS.';
create index whatsapp_integration_events_time_idx on public.whatsapp_integration_events(created_at desc);
create index whatsapp_integration_events_type_idx on public.whatsapp_integration_events(event_type,created_at desc);

create trigger audit_whatsapp_integrations after insert or update or delete on public.whatsapp_integrations for each row execute function public.audit_row_change();
create trigger audit_crm_leads after insert or update or delete on public.crm_leads for each row execute function public.audit_row_change();
create trigger audit_whatsapp_conversations after insert or update on public.whatsapp_conversations for each row execute function public.audit_row_change();

create or replace function public.whatsapp_touch_conversation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.whatsapp_conversations set
   last_message_at=new.created_at,
   last_inbound_at=case when new.direction='inbound' then new.created_at else last_inbound_at end,
   last_outbound_at=case when new.direction='outbound' then new.created_at else last_outbound_at end,
   message_count=message_count+1,updated_at=now()
 where id=new.conversation_id;
 return new;
end $$;
create trigger whatsapp_messages_touch after insert on public.whatsapp_messages for each row execute function public.whatsapp_touch_conversation();

-- Replica el patron de om_notify_quotation_event: notificacion vía
-- funcion security definer + trigger, dedup con not exists.
create or replace function public.whatsapp_notify_conversation_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status='human_required' then
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  select new.company_id,new.business_unit_id,p.id,'whatsapp_conversation.human_required','Conversacion de WhatsApp requiere atencion',
    'Un cliente necesita un vendedor en la conversacion de WhatsApp.','whatsapp_conversation',new.id,null
  from public.profiles p
  join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=new.company_id and ubu.business_unit_id=new.business_unit_id
  where p.active and p.deleted_at is null
   and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=p.role_id and perm.key='whatsapp.inbox.view' and perm.active)
   and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='whatsapp_conversation' and n.entity_id=new.id and n.event_key='whatsapp_conversation.human_required' and n.status='unread');
 end if;
 if new.assigned_user_id is distinct from old.assigned_user_id and new.assigned_user_id is not null then
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  values(new.company_id,new.business_unit_id,new.assigned_user_id,'whatsapp_conversation.assigned','Conversacion de WhatsApp asignada',
    'Se te asigno una conversacion de WhatsApp.','whatsapp_conversation',new.id,auth.uid());
 end if;
 return new;
end $$;
create trigger whatsapp_conversations_notify after update of status,assigned_user_id on public.whatsapp_conversations for each row execute function public.whatsapp_notify_conversation_event();

-- ===== Funciones solo para service_role (webhook, sin sesion de usuario) =====
-- Todas security definer: corren como el owner de la migracion (postgres),
-- que bypassa RLS -- por eso company_id/business_unit_id se resuelven aqui
-- adentro y nunca se aceptan como parametro directo desde TypeScript.

create or replace function public.whatsapp_ingest_inbound_message(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 integ public.whatsapp_integrations;
 lead public.crm_leads;
 conv public.whatsapp_conversations;
 msg_id uuid;
 from_number text:=payload->>'from_number';
 to_number text:=payload->>'to_number';
 provider_name text:=coalesce(payload->>'provider','twilio');
 ext_id text:=nullif(payload->>'external_message_id','');
 content_text text:=nullif(payload->>'content','');
 profile_name text:=nullif(trim(payload->>'profile_name'),'');
 is_opt_out boolean;
begin
 select * into integ from public.whatsapp_integrations where provider=provider_name and phone_number_e164=to_number;
 if not found then
   return jsonb_build_object('status','unknown_number');
 end if;
 if not integ.enabled then
   return jsonb_build_object('status','disabled','integration_id',integ.id);
 end if;
 update public.whatsapp_integrations set last_webhook_at=now() where id=integ.id;

 insert into public.crm_leads(company_id,business_unit_id,phone_e164,full_name,channel,created_via,last_interaction_at)
 values(integ.company_id,integ.business_unit_id,from_number,profile_name,'whatsapp','agent',now())
 on conflict (company_id,phone_e164) where deleted_at is null
 do update set full_name=coalesce(public.crm_leads.full_name,excluded.full_name),last_interaction_at=now()
 returning * into lead;

 insert into public.whatsapp_conversations(company_id,business_unit_id,integration_id,lead_id,provider,external_conversation_id,status)
 values(integ.company_id,integ.business_unit_id,integ.id,lead.id,provider_name,from_number,'ai_active')
 on conflict (integration_id,lead_id) where status<>'closed'
 do update set updated_at=now()
 returning * into conv;

 insert into public.whatsapp_messages(company_id,business_unit_id,conversation_id,provider,external_message_id,direction,sender_type,message_type,content,payload,delivery_status)
 values(integ.company_id,integ.business_unit_id,conv.id,provider_name,ext_id,'inbound','customer',
   coalesce(payload->>'message_type','text'),content_text,coalesce(payload->'raw','{}'::jsonb),'received')
 on conflict (provider,external_message_id) where external_message_id is not null do nothing
 returning id into msg_id;

 if msg_id is null and ext_id is not null then
   return jsonb_build_object('status','duplicate','conversation_id',conv.id);
 end if;

 is_opt_out:=content_text is not null and content_text ~* '\y(baja|stop|cancelar)\y';
 if is_opt_out then
   update public.crm_leads set status='discarded' where id=lead.id;
   update public.whatsapp_conversations set status='closed',closed_at=now(),close_reason='opt_out' where id=conv.id and status<>'closed';
   insert into public.whatsapp_integration_events(company_id,integration_id,event_type,severity,message,context)
   values(integ.company_id,integ.id,'opt_out','info','Cliente solicito baja',jsonb_build_object('lead_id',lead.id,'conversation_id',conv.id));
   return jsonb_build_object('status','ok','opted_out',true,'integration_id',integ.id,'company_id',integ.company_id,'business_unit_id',integ.business_unit_id,
     'lead_id',lead.id,'conversation_id',conv.id,'message_id',msg_id);
 end if;

 update public.whatsapp_conversations set ai_pending_since=now() where id=conv.id and status='ai_active' and integ.automation_enabled;

 return jsonb_build_object(
   'status','ok','opted_out',false,
   'integration_id',integ.id,'company_id',integ.company_id,'business_unit_id',integ.business_unit_id,
   'lead_id',lead.id,'conversation_id',conv.id,'message_id',msg_id,
   'conversation_status',conv.status,'automation_enabled',integ.automation_enabled,
   'agent_name',integ.agent_name,'fallback_message',integ.fallback_message
 );
end $$;
revoke execute on function public.whatsapp_ingest_inbound_message(jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_ingest_inbound_message(jsonb) to service_role;

create or replace function public.whatsapp_escalate_to_human(target_conversation uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.whatsapp_conversations set status='human_required',requires_human=true,ai_paused_reason=nullif(trim(reason),''),ai_pending_since=null,updated_at=now()
 where id=target_conversation and status not in('human_active','closed');
end $$;
revoke execute on function public.whatsapp_escalate_to_human(uuid,text) from public,anon,authenticated;
grant execute on function public.whatsapp_escalate_to_human(uuid,text) to service_role;

create or replace function public.whatsapp_record_agent_message(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_conversations; sender text:=coalesce(payload->>'sender_type','ai'); mid uuid;
begin
 if sender not in('ai','system') then raise exception 'Tipo de emisor invalido'; end if;
 select * into strict c from public.whatsapp_conversations where id=nullif(payload->>'conversation_id','')::uuid for update;
 insert into public.whatsapp_messages(company_id,business_unit_id,conversation_id,provider,external_message_id,direction,sender_type,message_type,content,delivery_status,ai_model,ai_intent)
 values(c.company_id,c.business_unit_id,c.id,c.provider,nullif(payload->>'external_message_id',''),'outbound',sender,
   coalesce(payload->>'message_type','text'),nullif(payload->>'content',''),coalesce(payload->>'delivery_status','sent'),
   nullif(payload->>'ai_model',''),nullif(payload->>'ai_intent',''))
 returning id into mid;
 update public.whatsapp_conversations set ai_pending_since=null where id=c.id;
 return mid;
end $$;
revoke execute on function public.whatsapp_record_agent_message(jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_record_agent_message(jsonb) to service_role;

create or replace function public.whatsapp_record_delivery_status(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.whatsapp_messages set delivery_status=coalesce(payload->>'delivery_status','sent'),error_message=nullif(payload->>'error_message','')
 where provider=coalesce(payload->>'provider','twilio') and external_message_id=payload->>'external_message_id';
end $$;
revoke execute on function public.whatsapp_record_delivery_status(jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_record_delivery_status(jsonb) to service_role;

create or replace function public.whatsapp_record_integration_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.whatsapp_integration_events(company_id,integration_id,event_type,severity,message,context)
 values(nullif(payload->>'company_id','')::uuid,nullif(payload->>'integration_id','')::uuid,payload->>'event_type',
   coalesce(payload->>'severity','info'),payload->>'message',coalesce(payload->'context','{}'::jsonb));
end $$;
revoke execute on function public.whatsapp_record_integration_event(jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_record_integration_event(jsonb) to service_role;

-- ===== Funciones para usuarios autenticados (security invoker: corren
-- bajo RLS del que llama, por eso mas abajo hay policies UPDATE/INSERT
-- que las habilitan) =====

create or replace function public.whatsapp_take_conversation(target_conversation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); c public.whatsapp_conversations;
begin
 if not public.has_permission('whatsapp.inbox.reply') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=target_conversation for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if c.status='closed' then raise exception 'La conversacion esta cerrada'; end if;
 update public.whatsapp_conversations set status='human_active',assigned_user_id=me,requires_human=false,ai_pending_since=null,updated_at=now() where id=c.id;
end $$;

create or replace function public.whatsapp_release_to_ai(target_conversation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations;
begin
 if not public.has_permission('whatsapp.agent.control') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=target_conversation for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if c.status='closed' then raise exception 'La conversacion esta cerrada'; end if;
 update public.whatsapp_conversations set status='ai_active',requires_human=false,ai_paused_reason=null,updated_at=now() where id=c.id;
end $$;

create or replace function public.whatsapp_pause_agent(target_conversation uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations;
begin
 if not public.has_permission('whatsapp.agent.control') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=target_conversation for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if c.status='closed' then raise exception 'La conversacion esta cerrada'; end if;
 update public.whatsapp_conversations set status='paused',ai_paused_reason=nullif(trim(reason),''),ai_pending_since=null,updated_at=now() where id=c.id;
end $$;

create or replace function public.whatsapp_assign_conversation(target_conversation uuid,new_assignee uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations;
begin
 if not public.has_permission('whatsapp.conversations.assign') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=target_conversation for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if new_assignee is null then raise exception 'Debes indicar un responsable'; end if;
 if not exists(select 1 from public.user_business_units ubu where ubu.user_id=new_assignee and ubu.company_id=c.company_id and ubu.business_unit_id=c.business_unit_id) then
   raise exception 'El responsable no pertenece a la unidad';
 end if;
 update public.whatsapp_conversations set assigned_user_id=new_assignee,
   status=case when c.status in('ai_active','human_required','paused') then 'human_active' else c.status end,
   requires_human=false,updated_at=now() where id=c.id;
end $$;

create or replace function public.whatsapp_close_conversation(target_conversation uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations;
begin
 if not public.has_permission('whatsapp.inbox.reply') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=target_conversation for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if c.status='closed' then raise exception 'La conversacion ya esta cerrada'; end if;
 update public.whatsapp_conversations set status='closed',closed_at=now(),closed_by=auth.uid(),close_reason=nullif(trim(reason),''),ai_pending_since=null,updated_at=now() where id=c.id;
end $$;

create or replace function public.whatsapp_request_quotation(target_conversation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations;
begin
 if not public.has_permission('whatsapp.inbox.reply') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=target_conversation for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 update public.crm_leads set status='quotation_requested',updated_at=now() where id=c.lead_id;
end $$;

create or replace function public.whatsapp_update_lead(target_lead uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); l public.crm_leads; new_assignee uuid;
begin
 if not public.has_permission('whatsapp.leads.manage') then raise exception 'Sin autorizacion'; end if;
 select * into strict l from public.crm_leads where id=target_lead and deleted_at is null for update;
 if not public.can_access_unit(l.company_id,l.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if payload ? 'assigned_user_id' and nullif(payload->>'assigned_user_id','') is not null then
   new_assignee:=(payload->>'assigned_user_id')::uuid;
   if not exists(select 1 from public.user_business_units ubu where ubu.user_id=new_assignee and ubu.company_id=l.company_id and ubu.business_unit_id=l.business_unit_id) then
     raise exception 'El vendedor no pertenece a la unidad';
   end if;
 end if;
 update public.crm_leads set
   full_name=coalesce(nullif(trim(payload->>'full_name'),''),full_name),
   city=coalesce(nullif(trim(payload->>'city'),''),city),
   product_interest=coalesce(nullif(payload->>'product_interest',''),product_interest),
   bedrooms=coalesce((payload->>'bedrooms')::smallint,bedrooms),
   bathrooms=coalesce((payload->>'bathrooms')::smallint,bathrooms),
   surface_m2=coalesce((payload->>'surface_m2')::numeric,surface_m2),
   budget_clp=coalesce((payload->>'budget_clp')::numeric,budget_clp),
   requires_transport=coalesce((payload->>'requires_transport')::boolean,requires_transport),
   requires_installation=coalesce((payload->>'requires_installation')::boolean,requires_installation),
   estimated_date=coalesce(nullif(payload->>'estimated_date','')::date,estimated_date),
   status=coalesce(nullif(payload->>'status',''),status),
   assigned_user_id=case when payload ? 'assigned_user_id' then new_assignee else assigned_user_id end,
   source_notes=coalesce(nullif(trim(payload->>'source_notes'),''),source_notes),
   updated_by=me,updated_at=now()
 where id=l.id;
end $$;

create or replace function public.whatsapp_record_outbound_reply(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); c public.whatsapp_conversations; mid uuid;
begin
 if not public.has_permission('whatsapp.inbox.reply') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.whatsapp_conversations where id=nullif(payload->>'conversation_id','')::uuid for update;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if c.status='closed' then raise exception 'La conversacion esta cerrada'; end if;
 if nullif(trim(payload->>'content'),'') is null then raise exception 'El mensaje no puede estar vacio'; end if;
 insert into public.whatsapp_messages(company_id,business_unit_id,conversation_id,provider,direction,sender_type,sender_user_id,message_type,content,delivery_status)
 values(c.company_id,c.business_unit_id,c.id,c.provider,'outbound','human',me,'text',trim(payload->>'content'),coalesce(payload->>'delivery_status','queued'))
 returning id into mid;
 update public.whatsapp_conversations set ai_pending_since=null where id=c.id;
 return mid;
end $$;

alter table public.whatsapp_integrations enable row level security;
alter table public.crm_leads enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_integration_events enable row level security;

create policy whatsapp_integrations_read on public.whatsapp_integrations for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (public.has_permission('whatsapp.inbox.view') or public.has_permission('whatsapp.settings.manage'))
);
create policy whatsapp_integrations_update on public.whatsapp_integrations for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('whatsapp.settings.manage')
) with check(public.can_access_unit(company_id,business_unit_id));

create policy crm_leads_read on public.crm_leads for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (
   assigned_user_id=(select auth.uid()) or created_by=(select auth.uid()) or public.has_permission('whatsapp.leads.view')
 )
);
create policy crm_leads_update on public.crm_leads for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('whatsapp.leads.manage')
) with check(public.can_access_unit(company_id,business_unit_id));

-- Bandeja compartida: whatsapp.inbox.view da acceso a todas las
-- conversaciones de la unidad, no solo a las asignadas al usuario.
create policy whatsapp_conversations_read on public.whatsapp_conversations for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (
   assigned_user_id=(select auth.uid()) or public.has_permission('whatsapp.inbox.view')
 )
);
create policy whatsapp_conversations_update on public.whatsapp_conversations for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (
   public.has_permission('whatsapp.inbox.reply') or public.has_permission('whatsapp.agent.control') or public.has_permission('whatsapp.conversations.assign')
 )
) with check(public.can_access_unit(company_id,business_unit_id));

create policy whatsapp_messages_read on public.whatsapp_messages for select to authenticated using(
 exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id and public.can_access_unit(c.company_id,c.business_unit_id)
   and (c.assigned_user_id=(select auth.uid()) or public.has_permission('whatsapp.inbox.view')))
);
create policy whatsapp_messages_insert on public.whatsapp_messages for insert to authenticated with check(
 exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id and public.can_access_unit(c.company_id,c.business_unit_id) and public.has_permission('whatsapp.inbox.reply'))
);

create policy whatsapp_integration_events_read on public.whatsapp_integration_events for select to authenticated using(
 company_id is not null and public.can_access_company(company_id) and public.has_permission('whatsapp.settings.manage')
);

grant select,update on public.whatsapp_integrations to authenticated,service_role;
grant insert on public.whatsapp_integrations to service_role;
grant select,update on public.crm_leads to authenticated,service_role;
grant insert on public.crm_leads to service_role;
grant select,update on public.whatsapp_conversations to authenticated,service_role;
grant insert on public.whatsapp_conversations to service_role;
grant select,insert on public.whatsapp_messages to authenticated,service_role;
grant update on public.whatsapp_messages to service_role;
grant select on public.whatsapp_integration_events to authenticated,service_role;
grant insert on public.whatsapp_integration_events to service_role;

grant execute on function
 public.whatsapp_take_conversation(uuid),
 public.whatsapp_release_to_ai(uuid),
 public.whatsapp_pause_agent(uuid,text),
 public.whatsapp_assign_conversation(uuid,uuid),
 public.whatsapp_close_conversation(uuid,text),
 public.whatsapp_request_quotation(uuid),
 public.whatsapp_update_lead(uuid,jsonb),
 public.whatsapp_record_outbound_reply(jsonb)
to authenticated;

-- Semilla: fila de integracion apuntando a la unidad OM, con el numero
-- del Sandbox de Twilio como placeholder editable desde /whatsapp/settings.
insert into public.whatsapp_integrations(company_id,business_unit_id,provider,phone_number_e164,display_name,fallback_message)
select bu.company_id,bu.id,'twilio','+14155238886','Oasis Modulares (Sandbox Twilio)',
 'Gracias por escribir a Oasis Modulares. En breve un vendedor te va a responder.'
from public.business_units bu where bu.code='OM' and bu.active and bu.deleted_at is null
on conflict(provider,phone_number_e164) do nothing;

commit;
