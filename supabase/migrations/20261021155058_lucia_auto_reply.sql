begin;

-- Etapa 2 de Lucía: respuesta automática. Lucía envía sola su borrador salvo
-- que el caso necesite a una persona. Todo se decide aquí, no en TypeScript:
-- * el chat está en manos de Lucía y sin pausa (equipo desde el teléfono);
-- * no hay marca de revisión humana (reclamo, reserva, fuera del manual,
--   audio o imagen) y Lucía no pidió derivar;
-- * el tope de gasto de hoy no se superó;
-- * la hostal asignada está en modo automático; sin hostal asignada, todas
--   las hostales habilitadas deben estar en automático;
-- * el borrador responde al último mensaje del cliente (no llegó otro mientras
--   Lucía redactaba).

alter table public.lucia_drafts add column auto_sent boolean not null default false;

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
 if c.needs_review or d.needs_human then return jsonb_build_object('sent',false,'reason','needs_human'); end if;
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
 return jsonb_build_object('sent',true,'message_id',mid);
end $$;
revoke execute on function public.lucia_auto_send_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lucia_auto_send_draft(uuid,uuid) to service_role;

commit;
