begin;

-- Asistente de pedidos de la distribuidora, etapa 2: conexión de WhatsApp.
-- Un worker Node.js (Baileys) corre fuera de Vercel con su propia sesión y solo habla con la base mediante
-- las funciones service_role de este archivo; nunca guarda la clave de Claude.

alter table public.dist_wa_settings
 add column connection_status text not null default 'disconnected' check(connection_status in('disconnected','qr_pending','connecting','connected','error')),
 add column qr_code text,
 add column qr_updated_at timestamptz,
 add column connected_phone text,
 add column worker_heartbeat_at timestamptz,
 add column last_connection_error text,
 -- Máximo de mensajes que el número envía por minuto.
 add column max_messages_per_minute smallint not null default 6 check(max_messages_per_minute between 1 and 30),
 -- Si alguien del equipo escribe desde el teléfono, el asistente se pausa en ese chat este tiempo.
 add column pause_minutes smallint not null default 180 check(pause_minutes between 5 and 1440),
 -- Números que el asistente nunca atiende (equipo, proveedores, familia): sus mensajes ni se guardan.
 add column ignored_phones text[] not null default '{}' check(cardinality(ignored_phones)<=200);

-- Credenciales de la sesión de WhatsApp: solo service_role (sin policies ni grants para usuarios).
create table public.dist_wa_auth(
 business_unit_id uuid not null references public.business_units(id),
 key text not null check(length(key) between 1 and 300),
 value jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(business_unit_id,key)
);
alter table public.dist_wa_auth enable row level security;
revoke all on public.dist_wa_auth from public,anon,authenticated;
grant select,insert,update,delete on public.dist_wa_auth to service_role;

-- ---------- Ajustes: ahora también números ignorados, pausa y límite por minuto ----------
create or replace function public.dist_wa_save_settings(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; v_acting uuid:=nullif(payload->>'acting_user_id','')::uuid; v_phones text[]; v_ignored text[]; p text; v_days smallint[];
begin
 if not public.has_permission('distribution.assistant.settings') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=(payload->>'business_unit_id')::uuid and code='DA' and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 select coalesce(array_agg(x::smallint order by x::smallint),'{}') into v_days from jsonb_array_elements_text(coalesce(payload->'delivery_weekdays','[]'::jsonb)) x;
 if cardinality(v_days)=0 then raise exception 'Elige al menos un dia de reparto'; end if;
 select coalesce(array_agg(btrim(x)),'{}') into v_phones from jsonb_array_elements_text(coalesce(payload->'notify_phones','[]'::jsonb)) x where btrim(x)<>'';
 select coalesce(array_agg(btrim(x)),'{}') into v_ignored from jsonb_array_elements_text(coalesce(payload->'ignored_phones','[]'::jsonb)) x where btrim(x)<>'';
 foreach p in array v_phones loop
  if p !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'El numero % no es valido (usa el formato +569XXXXXXXX)',p; end if;
 end loop;
 foreach p in array v_ignored loop
  if p !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'El numero % no es valido (usa el formato +569XXXXXXXX)',p; end if;
 end loop;
 if v_acting is not null then
  if not exists(select 1 from public.profiles pr join public.role_permissions rp on rp.role_id=pr.role_id join public.permissions pm on pm.id=rp.permission_id
                where pr.id=v_acting and pr.active and pr.deleted_at is null and pm.key='finance.distribution.orders.create' and pm.active)
     or not exists(select 1 from public.user_business_units ubu where ubu.user_id=v_acting and ubu.business_unit_id=unit.id) then
   raise exception 'Ese usuario no puede crear pedidos de la distribuidora';
  end if;
 end if;
 if coalesce((payload->>'enabled')::boolean,false) and (v_acting is null) then raise exception 'Para activar el asistente elige a nombre de quien se crean los pedidos'; end if;
 insert into public.dist_wa_settings(company_id,business_unit_id,enabled,agent_name,general_instructions,model,daily_budget_usd,history_messages,same_day_cutoff,delivery_weekdays,max_quantity_per_line,max_order_total,acting_user_id,notify_phones,ignored_phones,pause_minutes,max_messages_per_minute,updated_by)
 values(unit.company_id,unit.id,coalesce((payload->>'enabled')::boolean,false),btrim(payload->>'agent_name'),coalesce(payload->>'general_instructions',''),coalesce(payload->>'model','claude-haiku-4-5'),
  coalesce((payload->>'daily_budget_usd')::numeric,5),coalesce((payload->>'history_messages')::smallint,20),(payload->>'same_day_cutoff')::time,v_days,
  (payload->>'max_quantity_per_line')::integer,(payload->>'max_order_total')::numeric,v_acting,v_phones,v_ignored,
  coalesce((payload->>'pause_minutes')::smallint,180),coalesce((payload->>'max_messages_per_minute')::smallint,6),auth.uid())
 on conflict(business_unit_id) do update set enabled=excluded.enabled,agent_name=excluded.agent_name,general_instructions=excluded.general_instructions,model=excluded.model,
  daily_budget_usd=excluded.daily_budget_usd,history_messages=excluded.history_messages,same_day_cutoff=excluded.same_day_cutoff,delivery_weekdays=excluded.delivery_weekdays,
  max_quantity_per_line=excluded.max_quantity_per_line,max_order_total=excluded.max_order_total,acting_user_id=excluded.acting_user_id,notify_phones=excluded.notify_phones,
  ignored_phones=excluded.ignored_phones,pause_minutes=excluded.pause_minutes,max_messages_per_minute=excluded.max_messages_per_minute,updated_by=excluded.updated_by;
end $$;
revoke execute on function public.dist_wa_save_settings(jsonb) from public,anon;
grant execute on function public.dist_wa_save_settings(jsonb) to authenticated;

-- QR para vincular el número (solo quien configura, y solo mientras espera el escaneo).
create or replace function public.dist_wa_connection_qr() returns text language plpgsql stable security definer set search_path='' as $$
declare s public.dist_wa_settings;
begin
 if not public.has_permission('distribution.assistant.settings') then raise exception 'Sin autorizacion'; end if;
 select * into s from public.dist_wa_settings where public.can_access_unit(company_id,business_unit_id) limit 1;
 if not found or s.connection_status<>'qr_pending' then return null; end if;
 return s.qr_code;
end $$;
revoke execute on function public.dist_wa_connection_qr() from public,anon;
grant execute on function public.dist_wa_connection_qr() to authenticated;

-- ---------- Funciones del worker (solo service_role) ----------

create or replace function public.dist_wa_worker_status(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare st text:=nullif(payload->>'status','');
begin
 update public.dist_wa_settings set
   connection_status=coalesce(st,connection_status),
   qr_code=case when st='qr_pending' then nullif(payload->>'qr','') when st is not null then null else qr_code end,
   qr_updated_at=case when st='qr_pending' then now() else qr_updated_at end,
   connected_phone=case when st='connected' then coalesce(nullif(payload->>'phone',''),connected_phone) when st='disconnected' then null else connected_phone end,
   last_connection_error=case when st='error' then left(payload->>'error',500) when st='connected' then null else last_connection_error end,
   worker_heartbeat_at=now()
 where business_unit_id=nullif(payload->>'business_unit_id','')::uuid;
end $$;
revoke execute on function public.dist_wa_worker_status(jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_worker_status(jsonb) to service_role;

-- Registra un mensaje de WhatsApp (del cliente o escrito por el equipo desde el teléfono).
create or replace function public.dist_wa_ingest_message(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.dist_wa_settings; conv public.dist_wa_conversations; mid uuid;
 jid text:=nullif(trim(payload->>'jid'),''); phone text:=nullif(trim(payload->>'phone'),''); ext text:=nullif(trim(payload->>'external_id'),'');
 mtype text:=coalesce(nullif(payload->>'message_type',''),'text'); body text:=nullif(payload->>'content',''); pname text:=nullif(trim(payload->>'push_name'),'');
 from_me boolean:=coalesce((payload->>'from_me')::boolean,false); last9 text;
begin
 select * into s from public.dist_wa_settings where business_unit_id=nullif(payload->>'business_unit_id','')::uuid;
 if not found then return jsonb_build_object('status','not_configured'); end if;
 if jid is null then raise exception 'Falta el identificador del chat'; end if;
 if phone is not null then phone:=regexp_replace(phone,'[\s()-]','','g'); end if;
 if phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$' then phone:=null; end if;
 if mtype not in('text','audio','image','video','document','sticker','location','contact','other') then mtype:='other'; end if;
 -- Equipo, proveedores y otros contactos ignorados: el mensaje ni se guarda.
 if phone is not null then
  last9:=right(regexp_replace(phone,'\D','','g'),9);
  if exists(select 1 from unnest(s.ignored_phones||s.notify_phones) n where right(regexp_replace(n,'\D','','g'),9)=last9) then
   return jsonb_build_object('status','ignored');
  end if;
 end if;
 if ext is not null and exists(select 1 from public.dist_wa_messages m where m.company_id=s.company_id and m.external_id=ext) then
  return jsonb_build_object('status','duplicate');
 end if;
 insert into public.dist_wa_conversations(company_id,business_unit_id,channel,contact_jid,contact_phone,contact_name)
 values(s.company_id,s.business_unit_id,'whatsapp',jid,phone,case when from_me then null else pname end)
 on conflict(company_id,channel,contact_jid) where status<>'closed'
 do update set contact_phone=coalesce(public.dist_wa_conversations.contact_phone,excluded.contact_phone),
   contact_name=coalesce(public.dist_wa_conversations.contact_name,excluded.contact_name),updated_at=now()
 returning * into conv;
 insert into public.dist_wa_messages(company_id,business_unit_id,conversation_id,direction,sender_type,message_type,content,external_id,delivery_status,sent_at)
 values(conv.company_id,conv.business_unit_id,conv.id,case when from_me then 'outbound' else 'inbound' end,case when from_me then 'human' else 'customer' end,
  mtype,left(body,8000),ext,case when from_me then 'sent' else 'received' end,case when from_me then now() end)
 on conflict(company_id,external_id) where external_id is not null do nothing
 returning id into mid;
 if mid is null then return jsonb_build_object('status','duplicate','conversation_id',conv.id); end if;
 if from_me then
  -- Alguien del equipo escribió desde el teléfono: el asistente se pausa en este chat.
  update public.dist_wa_conversations set paused_until=now()+make_interval(mins=>s.pause_minutes),updated_at=now() where id=conv.id;
  return jsonb_build_object('status','team_message','conversation_id',conv.id,'message_id',mid,'process',false);
 end if;
 if mtype<>'text' then
  update public.dist_wa_conversations set needs_review=true,
   review_reason=case mtype when 'audio' then 'Audio: requiere revisión humana' when 'image' then 'Imagen: requiere revisión humana' else 'Archivo o mensaje no textual: requiere revisión humana' end,
   updated_at=now() where id=conv.id;
 end if;
 return jsonb_build_object('status',case when mtype<>'text' then 'needs_review' else 'ok' end,'conversation_id',conv.id,'message_id',mid,
  'process',s.enabled and conv.status='assistant' and (conv.paused_until is null or conv.paused_until<now()));
end $$;
revoke execute on function public.dist_wa_ingest_message(jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_ingest_message(jsonb) to service_role;

-- Toma el siguiente mensaje en cola (uno por vez) respetando el límite por minuto.
create or replace function public.dist_wa_claim_outbound(target_unit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.dist_wa_settings; m public.dist_wa_messages; recent integer; jid text;
begin
 select * into s from public.dist_wa_settings where business_unit_id=target_unit;
 if not found or s.connection_status<>'connected' then return null; end if;
 select count(*) into recent from public.dist_wa_messages lm join public.dist_wa_conversations lc on lc.id=lm.conversation_id
  where lm.business_unit_id=target_unit and lc.channel='whatsapp' and lm.direction='outbound' and lm.sender_type in('assistant','human')
    and lm.sent_at>now()-interval '1 minute' and lm.delivery_status in('sent','sending');
 if recent>=s.max_messages_per_minute then return null; end if;
 -- Un mensaje que quedó "enviando" por más de 2 minutos (worker caído) vuelve a la cola.
 update public.dist_wa_messages set delivery_status='queued' where business_unit_id=target_unit and delivery_status='sending' and sent_at<now()-interval '2 minutes';
 select * into m from public.dist_wa_messages where business_unit_id=target_unit and delivery_status='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if m.attempts>=3 then
  update public.dist_wa_messages set delivery_status='failed',error_message=coalesce(error_message,'Se agotaron los reintentos') where id=m.id;
  return null;
 end if;
 select contact_jid into jid from public.dist_wa_conversations where id=m.conversation_id;
 update public.dist_wa_messages set delivery_status='sending',attempts=attempts+1,sent_at=now() where id=m.id;
 return jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'jid',jid,'content',m.content);
end $$;
revoke execute on function public.dist_wa_claim_outbound(uuid) from public,anon,authenticated;
grant execute on function public.dist_wa_claim_outbound(uuid) to service_role;

create or replace function public.dist_wa_mark_outbound(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.dist_wa_messages; ok boolean:=coalesce((payload->>'ok')::boolean,false);
begin
 select * into strict m from public.dist_wa_messages where id=nullif(payload->>'id','')::uuid for update;
 update public.dist_wa_messages set
  delivery_status=case when ok then 'sent' when m.attempts>=3 then 'failed' else 'queued' end,
  external_id=coalesce(nullif(payload->>'external_id',''),external_id),
  error_message=case when ok then null else left(payload->>'error',500) end,
  sent_at=case when ok then now() else sent_at end
 where id=m.id;
 if not ok then
  insert into public.dist_wa_events(company_id,business_unit_id,conversation_id,severity,event_type,message,context)
  values(m.company_id,m.business_unit_id,m.conversation_id,'error','send_failed',coalesce(left(payload->>'error',500),'No se pudo enviar el mensaje'),jsonb_build_object('message_id',m.id,'attempts',m.attempts));
 end if;
end $$;
revoke execute on function public.dist_wa_mark_outbound(jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_mark_outbound(jsonb) to service_role;

-- Chats cuya pausa terminó con un mensaje del cliente sin responder: el asistente retoma.
create or replace function public.dist_wa_resume_after_pause(target_unit uuid) returns setof uuid language plpgsql security definer set search_path='' as $$
begin
 return query
 update public.dist_wa_conversations c set paused_until=null,updated_at=now()
 where c.business_unit_id=target_unit and c.channel='whatsapp' and c.status='assistant'
  and c.paused_until<=now() and c.paused_until>now()-interval '6 hours'
  and c.last_inbound_at is not null and (c.last_outbound_at is null or c.last_inbound_at>c.last_outbound_at)
 returning c.id;
end $$;
revoke execute on function public.dist_wa_resume_after_pause(uuid) from public,anon,authenticated;
grant execute on function public.dist_wa_resume_after_pause(uuid) to service_role;

commit;
