begin;

-- Lucía siempre responde en modo automático. Cuando el caso necesita a una
-- persona (disponibilidad que aún no ve, reserva, reclamo, fuera del manual)
-- igual envía su respuesta, que por reglas nunca inventa datos y avisa que
-- el encargado confirmará; la conversación queda marcada para revisión.
-- Dejar al cliente sin respuesta era peor. Para no pisarse con el equipo:
-- * si alguien responde desde la bandeja, Lucía se pausa 12 h en ese chat
--   (igual que cuando responden desde el teléfono);
-- * "Tomar control" la detiene hasta que la devuelvan.
-- Audios e imágenes también reciben respuesta (pidiendo que lo escriban).

create or replace function public.lucia_auto_send_draft(target_draft uuid,answered_message uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 d public.lucia_drafts;
 c public.lucia_conversations;
 s public.lucia_settings;
 hostel_mode text;
 last_inbound timestamptz;
 mid uuid;
begin
 select * into d from public.lucia_drafts where id=target_draft for update;
 if not found or d.status<>'pending' then return jsonb_build_object('sent',false,'reason','not_pending'); end if;
 select * into strict c from public.lucia_conversations where id=d.conversation_id for update;
 select * into strict s from public.lucia_settings where company_id=c.company_id;

 if c.status<>'lucia' then return jsonb_build_object('sent',false,'reason','human_control'); end if;
 if c.paused_until is not null and c.paused_until>now() then return jsonb_build_object('sent',false,'reason','paused'); end if;
 if s.budget_exceeded_on=(now() at time zone 'America/Santiago')::date then return jsonb_build_object('sent',false,'reason','budget'); end if;

 if c.hostel_assigned then
   select h.mode into hostel_mode from public.lucia_hostels h where h.company_id=c.company_id and h.business_unit_id=c.business_unit_id and h.enabled;
 else
   select case when count(*)>0 and bool_and(h.mode='auto') then 'auto' else 'draft' end into hostel_mode
   from public.lucia_hostels h where h.company_id=c.company_id and h.enabled;
 end if;
 if hostel_mode is distinct from 'auto' then return jsonb_build_object('sent',false,'reason','draft_mode'); end if;

 -- Si el cliente escribió de nuevo mientras Lucía redactaba, esta respuesta
 -- quedó vieja: el próximo procesamiento responderá a todo junto.
 select m.created_at into last_inbound from public.lucia_messages m where m.id=answered_message and m.conversation_id=c.id and m.direction='inbound';
 if last_inbound is null or exists(select 1 from public.lucia_messages m where m.conversation_id=c.id and m.direction='inbound' and m.created_at>last_inbound) then
   return jsonb_build_object('sent',false,'reason','newer_message');
 end if;

 mid:=public.lucia_enqueue_outbound(c,'lucia',null,d.content,d.id);
 update public.lucia_drafts set status='sent',auto_sent=true,decided_at=now(),sent_message_id=mid where id=d.id;
 return jsonb_build_object('sent',true,'message_id',mid,'needs_human',c.needs_review or d.needs_human);
end $$;

create or replace function public.lucia_send_reply(target_conversation uuid,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; mid uuid;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 mid:=public.lucia_enqueue_outbound(c,'human',auth.uid(),body,null);
 update public.lucia_drafts set status='superseded' where conversation_id=c.id and status='pending';
 update public.lucia_conversations set paused_until=now()+interval '12 hours',pause_reason='El equipo respondió desde la bandeja',updated_at=now()
 where id=c.id and c.channel<>'simulator';
 return mid;
end $$;

-- Audios e imágenes: se marcan para revisión, pero Lucía también responde.
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
   -- Lucía igual responde (pide que lo escriban) y el chat queda para revisión.
   return jsonb_build_object('status','needs_review','conversation_id',conv.id,'message_id',mid,
     'process',conv.status='lucia' and (conv.paused_until is null or conv.paused_until<now()));
 end if;

 return jsonb_build_object('status','ok','conversation_id',conv.id,'message_id',mid,
   'process',conv.status='lucia' and (conv.paused_until is null or conv.paused_until<now()));
end $$;

commit;
