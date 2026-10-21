begin;

-- Horario de check-in y check-out por hostal (hoy las tres: entrada desde
-- las 14:00 y salida hasta las 12:00 del día siguiente). Se muestra en el
-- resumen de la solicitud y en los mensajes de confirmación.

alter table public.lucia_hostels
 add column checkin_time time not null default '14:00',
 add column checkout_time time not null default '12:00';
grant update(checkin_time,checkout_time) on public.lucia_hostels to authenticated;

create or replace function public.lucia_booking_summary(c public.lucia_conversations) returns text language sql stable security definer set search_path='' as $$
 select concat_ws(E'\n',
  '👤 '||coalesce(c.guest_name,c.contact_name,'Sin nombre')||coalesce(' · '||c.contact_phone,''),
  '📅 '||to_char(c.check_in,'DD-MM-YYYY')||' al '||to_char(c.check_out,'DD-MM-YYYY')||' ('||(c.check_out-c.check_in)||' noche'||case when c.check_out-c.check_in=1 then '' else 's' end||')',
  '🕑 Check-in desde las '||to_char(h.checkin_time,'HH24:MI')||' · Check-out hasta las '||to_char(h.checkout_time,'HH24:MI'),
  '👥 '||c.guests||' persona'||case when c.guests=1 then '' else 's' end,
  '🛏️ '||coalesce(c.room_type,'Habitación por definir'))
 from public.lucia_hostels h where h.company_id=c.company_id and h.business_unit_id=c.business_unit_id
$$;
revoke execute on function public.lucia_booking_summary(public.lucia_conversations) from public,anon,authenticated;

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
     '📝 *Resumen de tu solicitud*',
     '👤 Nombre: '||coalesce(c.guest_name,c.contact_name,'—'),
     case when c.contact_phone is not null then '📱 Teléfono: '||c.contact_phone end,
     '🏨 Hostal: '||h.display_name,
     case when c.room_type is not null then '🛏️ Habitación: '||c.room_type end,
     '📅 Entrada: '||public.lucia_date_es(c.check_in)||', desde las '||to_char(h.checkin_time,'HH24:MI'),
     '📅 Salida: '||public.lucia_date_es(c.check_out)||', hasta las '||to_char(h.checkout_time,'HH24:MI')||' ('||nights||' noche'||case when nights=1 then '' else 's' end||')',
     '👥 Personas: '||c.guests,
     case when estimate is not null then '💰 Valor estimado: '||public.lucia_clp(estimate) end,
     '',
     '⏳ Estoy confirmando la disponibilidad con recepción. En unos minutos te envío el monto del abono ('||h.deposit_percent||'%) y los datos para transferir. La reserva queda confirmada al recibir el abono o el pago total.'),
   null);

 link:=nullif(rtrim(payload->>'app_url','/'),'')||'/lodging/lucia/'||c.id;
 perform public.lucia_message_manager(c,'🔔 Nueva solicitud de reserva por WhatsApp'||E'\n'||public.lucia_booking_summary(c)||
   case when estimate is not null then E'\n'||'💰 Valor estimado: '||public.lucia_clp(estimate) else E'\n'||'⚠️ No encontré una habitación libre que admita '||c.guests||' personas: revisa antes de confirmar.' end||E'\n\n'||
   '¿Hay disponibilidad? Responde *OK '||code||'* para confirmar o *NO '||code||'* si no hay.'||coalesce(E'\n'||'O revisa la ficha: '||link,''));
 perform public.lucia_notify_unit(c,'lucia.booking_requested','Lucía: confirmar disponibilidad',
   coalesce(c.guest_name,c.contact_name,'Un cliente')||' quiere reservar del '||to_char(c.check_in,'DD-MM')||' al '||to_char(c.check_out,'DD-MM')||' ('||c.guests||' pers.). Confirma la disponibilidad.');
 return jsonb_build_object('ok',true,'code',code,'estimate',estimate);
end $$;
revoke execute on function public.lucia_request_booking(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_request_booking(jsonb) to service_role;

commit;
