begin;

-- El recontacto de los 20 minutos no se envía a quien ya agradeció, se despidió o dijo que no le sirve,
-- y el saludo solo usa el nombre si trae letras (un contacto llamado «.» daba «¡Hola .!»).
create or replace function public.lucia_send_followups(target_company uuid) returns integer language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; h public.lucia_hostels; n int:=0; local_now timestamp:=now() at time zone 'America/Santiago'; first_name text; body text;
begin
 if extract(hour from local_now)<8 or extract(hour from local_now)>=22 then return 0; end if;
 for c in
   select * from public.lucia_conversations
   where company_id=target_company and channel='whatsapp' and status='lucia' and not needs_review
     and (paused_until is null or paused_until<now())
     and last_outbound_at is not null and last_outbound_at>coalesce(last_inbound_at,'-infinity')
     and last_outbound_at<now()-interval '20 minutes' and last_outbound_at>now()-interval '3 hours'
     and (followup_sent_at is null or followup_sent_at<coalesce(last_inbound_at,'-infinity'))
     and (booking_status='awaiting_payment'
          or (booking_status in('none','expired','rejected') and check_in is not null and check_in>=local_now::date))
     and not exists(select 1 from public.lucia_messages m where m.conversation_id=lucia_conversations.id and m.delivery_status in('queued','sending'))
     and not coalesce((select m.content ~* '(gracias|chao|chau|adi[oó]s|hasta luego|nos vemos|no me sirve|no me interesa|no me alcanza|ya no|no necesito|lo voy a pensar|lo pienso|d[eé]jalo|dej[eé]moslo)'
                       from public.lucia_messages m where m.conversation_id=lucia_conversations.id and m.sender_type='customer'
                       order by m.created_at desc limit 1),false)
   for update skip locked
 loop
   select * into h from public.lucia_hostels where company_id=c.company_id and business_unit_id=c.business_unit_id;
   first_name:=nullif(split_part(trim(coalesce(c.guest_name,c.contact_name,'')),' ',1),'');
   if first_name is not null and first_name !~ '[[:alpha:]]' then first_name:=null; end if;
   if c.booking_status='awaiting_payment' then
     body:='¡Hola'||coalesce(' '||first_name,'')||'! 😊 ¿Vas a querer la habitación'||coalesce(' en '||case when c.hostel_assigned then h.display_name end,'')||'? '||
       case when c.hold_expires_at is not null then 'Te la tengo guardada hasta las '||to_char(c.hold_expires_at at time zone 'America/Santiago','HH24:MI')||'. ' else '' end||
       'Si ya transferiste, envíame el comprobante por aquí 📸';
   else
     body:='¡Hola'||coalesce(' '||first_name,'')||'! 😊 ¿Pudiste revisar las opciones? ¿Te gustaría que te reserve alguna? Si tienes cualquier duda, aquí estoy 🙌';
   end if;
   perform public.lucia_enqueue_outbound(c,'lucia',null,body,null);
   update public.lucia_conversations set followup_sent_at=now() where id=c.id;
   n:=n+1;
 end loop;
 return n;
end $$;
revoke execute on function public.lucia_send_followups(uuid) from public,anon,authenticated;
grant execute on function public.lucia_send_followups(uuid) to service_role;

commit;
