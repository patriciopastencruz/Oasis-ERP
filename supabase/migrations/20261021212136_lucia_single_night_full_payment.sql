begin;

-- Regla por hostal: las reservas de una sola noche se confirman con el pago
-- total (Cobija). Desde 2 noches rige el abono configurado (50%).

alter table public.lucia_hostels add column full_payment_single_night boolean not null default false;
grant update(full_payment_single_night) on public.lucia_hostels to authenticated;

update public.lucia_hostels h set full_payment_single_night=true
from public.business_units bu where bu.id=h.business_unit_id and bu.code='HOB';

create or replace function public.lucia_booking_confirm_internal(target_conversation uuid,target_room uuid,via text,actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.lucia_conversations; h public.lucia_hostels; r public.lodging_rooms;
 room uuid; gid uuid; rid uuid; rate numeric; nights int; total numeric; deposit numeric;
begin
 select * into c from public.lucia_conversations where id=target_conversation for update;
 if not found then raise exception 'Conversación no encontrada'; end if;
 if c.booking_status<>'awaiting_reception' then raise exception 'Esta solicitud ya fue respondida'; end if;
 select * into strict h from public.lucia_hostels where company_id=c.company_id and business_unit_id=c.business_unit_id;
 room:=coalesce(target_room,public.lucia_pick_room(c));
 if room is null then raise exception 'No hay una habitación libre que admita % personas en esas fechas',c.guests; end if;
 select * into r from public.lodging_rooms where id=room and business_unit_id=c.business_unit_id and active and capacity>=c.guests for update;
 if not found then raise exception 'La habitación no corresponde a la hostal o no admite % personas',c.guests; end if;
 if exists(select 1 from public.lodging_reservations x where x.room_id=room and x.status not in('cancelled','conflict') and x.check_in<c.check_out and x.check_out>c.check_in) then
   raise exception 'Esa habitación ya está ocupada en esas fechas';
 end if;

 nights:=c.check_out-c.check_in;
 rate:=public.lucia_rate_for_guests(r.base_rate,r.rates_by_guests,c.guests);
 total:=rate*nights;
 -- Cobija: una sola noche se paga completa.
 deposit:=case when h.full_payment_single_night and nights=1 then total else round(total*h.deposit_percent/100.0) end;

 insert into public.lodging_guests(company_id,business_unit_id,full_name,phone,notes)
 values(c.company_id,c.business_unit_id,coalesce(c.guest_name,c.contact_name,'Cliente WhatsApp'),coalesce(c.contact_phone,'sin teléfono'),'Creado por Lucía (WhatsApp)')
 returning id into gid;
 insert into public.lodging_reservations(company_id,business_unit_id,room_id,guest_id,origin,status,check_in,check_out,guest_count,nightly_rate,total_value,notes,created_by)
 values(c.company_id,c.business_unit_id,room,gid,'whatsapp','pending',c.check_in,c.check_out,c.guests,rate,total,
   'Reserva pendiente de abono creada por Lucía (WhatsApp). Se anula sola si no llega el pago a tiempo.',actor)
 returning id into rid;

 update public.lucia_conversations set booking_status='awaiting_payment',booking_room_id=room,reservation_id=rid,
   booking_confirmed_by=actor,booking_confirmed_via=via,booking_confirmed_at=now(),
   hold_expires_at=now()+make_interval(mins=>h.hold_minutes),booking_total=total,booking_deposit=deposit,
   quoted_amount=total,quoted_at=now(),prospect_status='pre_reserved',updated_at=now()
 where id=c.id returning * into c;

 perform public.lucia_enqueue_outbound(c,'lucia',null,
   '✅ ¡Buenas noticias! Recepción confirmó la disponibilidad:'||E'\n'||public.lucia_booking_summary(c)||E'\n\n'||
   '💰 Total de la estadía: '||public.lucia_clp(total)||E'\n'||
   case when deposit<total then '🔒 Para confirmar la reserva puedes abonar el '||h.deposit_percent||'% ('||public.lucia_clp(deposit)||') o pagar el total.'
        when h.full_payment_single_night and nights=1 then '🔒 Las reservas de 1 noche se confirman con el pago total.'
        else '🔒 Para confirmar la reserva se paga el total.' end||E'\n\n'||
   case when length(trim(h.payment_instructions))>0 then '🏦 Datos para transferir:'||E'\n'||trim(h.payment_instructions)||E'\n\n' else '' end||
   '📸 Cuando transfieras, envíame el comprobante por aquí. Te guardo la habitación por '||
   case when h.hold_minutes>=60 and h.hold_minutes%60=0 then (h.hold_minutes/60)||' hora'||case when h.hold_minutes=60 then '' else 's' end else h.hold_minutes||' minutos' end||' 😊',
   null);
 perform public.lucia_message_manager(c,'✅ Disponibilidad confirmada'||case when via='whatsapp' then ' por WhatsApp' else ' en el ERP' end||'. Se envió al cliente el monto y los datos de pago; la habitación queda guardada '||h.hold_minutes||' min.'||E'\n'||public.lucia_booking_summary(c));
 return jsonb_build_object('ok',true,'reservation_id',rid,'room_id',room,'total',total,'deposit',deposit);
end $$;

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

revoke execute on function public.lucia_booking_confirm_internal(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke execute on function public.lucia_request_booking(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_request_booking(jsonb) to service_role;

commit;
