begin;

-- 1. Al pedir confirmación a recepción el cliente recibe UN mensaje fijo:
--    saludo + resumen (el texto libre de Lucía ya no se envía en ese turno,
--    para que no contradiga el resumen).
-- 2. Recontacto: si el cliente no responde en 20 minutos después de recibir
--    opciones o mientras se espera su pago, Lucía le escribe una vez para
--    saber si quiere la habitación. Solo entre 8:00 y 22:00 (hora de Chile),
--    nunca si una persona tomó el chat, hay revisión pendiente o se espera a
--    recepción. Lo llama el worker cada minuto.

alter table public.lucia_conversations add column followup_sent_at timestamptz;

create or replace function public.lucia_request_booking(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; h public.lucia_hostels; code text; link text; room uuid; r public.lodging_rooms; estimate numeric; nights int;
begin
 select * into c from public.lucia_conversations where id=nullif(payload->>'conversation_id','')::uuid for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
 if c.booking_status in('awaiting_reception','awaiting_payment','proof_received','confirmed') then
   return jsonb_build_object('ok',false,'reason','already_in_progress');
 end if;
 if not c.hostel_assigned or c.check_in is null or c.check_out is null or c.guests is null then
   return jsonb_build_object('ok',false,'reason','missing_data');
 end if;
 if c.check_in<(now() at time zone 'America/Santiago')::date then return jsonb_build_object('ok',false,'reason','past_date'); end if;
 select * into strict h from public.lucia_hostels where company_id=c.company_id and business_unit_id=c.business_unit_id;
 code:=lpad((floor(random()*9000)+1000)::int::text,4,'0');
 update public.lucia_conversations set booking_status='awaiting_reception',booking_code=code,booking_requested_at=now(),
   booking_room_id=null,hold_expires_at=null,booking_total=null,booking_deposit=null,proof_received_at=null,
   prospect_status='pre_reserved',updated_at=now()
 where id=c.id returning * into c;

 -- Valor estimado con la habitación libre que se le asignaría hoy.
 nights:=c.check_out-c.check_in;
 room:=public.lucia_pick_room(c);
 if room is not null then
   select * into r from public.lodging_rooms where id=room;
   estimate:=public.lucia_rate_for_guests(r.base_rate,r.rates_by_guests,c.guests)*nights;
 end if;

 perform public.lucia_enqueue_outbound(c,'lucia',null,
   concat_ws(E'\n',
     '¡Perfecto'||coalesce(', '||nullif(split_part(trim(coalesce(c.guest_name,c.contact_name,'')),' ',1),''),'')||'! 🙌',
     '',
     '📝 *Resumen de tu solicitud*',
     '👤 Nombre: '||coalesce(c.guest_name,c.contact_name,'—'),
     case when c.contact_phone is not null then '📱 Teléfono: '||c.contact_phone end,
     '🏨 Hostal: '||h.display_name,
     case when c.room_type is not null then '🛏️ '||c.room_type end,
     '📅 Entrada: '||public.lucia_date_es(c.check_in)||', desde las '||to_char(h.checkin_time,'HH24:MI'),
     '📅 Salida: '||public.lucia_date_es(c.check_out)||', hasta las '||to_char(h.checkout_time,'HH24:MI')||' ('||nights||' noche'||case when nights=1 then '' else 's' end||')',
     '👥 Personas: '||c.guests,
     case when estimate is not null then '💰 Valor estimado: '||public.lucia_clp(estimate) end,
     '',
     case when h.full_payment_single_night and nights=1
       then '⏳ Estoy confirmando la disponibilidad con recepción. En unos minutos te envío el monto y los datos para transferir. Las reservas de 1 noche se confirman con el pago total.'
       else '⏳ Estoy confirmando la disponibilidad con recepción. En unos minutos te envío el monto del abono ('||h.deposit_percent||'%) y los datos para transferir. La reserva queda confirmada al recibir el abono o el pago total.' end),
   null);

 link:=nullif(rtrim(payload->>'app_url','/'),'')||'/lodging/lucia/'||c.id;
 perform public.lucia_message_manager(c,'🔔 Nueva solicitud de reserva por WhatsApp'||E'\n'||public.lucia_booking_summary(c)||
   case when estimate is not null then E'\n'||'💰 Valor estimado: '||public.lucia_clp(estimate) else E'\n'||'⚠️ No encontré una habitación libre que admita '||c.guests||' personas: revisa antes de confirmar.' end||E'\n\n'||
   '¿Hay disponibilidad? Responde *OK '||code||'* para confirmar o *NO '||code||'* si no hay.'||coalesce(E'\n'||'O revisa la ficha: '||link,''));
 perform public.lucia_notify_unit(c,'lucia.booking_requested','Lucía: confirmar disponibilidad',
   coalesce(c.guest_name,c.contact_name,'Un cliente')||' quiere reservar del '||to_char(c.check_in,'DD-MM')||' al '||to_char(c.check_out,'DD-MM')||' ('||c.guests||' pers.). Confirma la disponibilidad.');
 return jsonb_build_object('ok',true,'code',code,'estimate',estimate);
end $$;

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
   for update skip locked
 loop
   select * into h from public.lucia_hostels where company_id=c.company_id and business_unit_id=c.business_unit_id;
   first_name:=nullif(split_part(trim(coalesce(c.guest_name,c.contact_name,'')),' ',1),'');
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

revoke execute on function public.lucia_request_booking(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_request_booking(jsonb) to service_role;

commit;
