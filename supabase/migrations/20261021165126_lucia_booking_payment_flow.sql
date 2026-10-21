begin;

-- Etapa 4 de Lucía: cierre de venta con abono.
--   1. El cliente elige una opción y quiere reservar → Lucía pide
--      confirmación a recepción (booking_status='awaiting_reception') y avisa
--      al encargado por WhatsApp (con un código) y en el ERP.
--   2. Recepción confirma con el botón del ERP o respondiendo "OK <código>"
--      por WhatsApp; vale la primera. Se crea una reserva PENDIENTE que guarda
--      la habitación durante hold_minutes y Lucía envía al cliente el monto
--      (abono = deposit_percent % o total) y los datos de transferencia de la
--      hostal. "NO <código>" o el botón "No hay disponibilidad" lo rechaza.
--   3. El cliente envía el comprobante (imagen o documento) → se avisa al
--      encargado y la reserva se sigue guardando hasta que la revisen.
--   4. El encargado verifica el pago en el ERP → se registra el pago, la
--      reserva queda confirmada y Lucía avisa al cliente.
--   Si vence el plazo sin comprobante, la reserva pendiente se anula sola.
-- Montos, habitación y datos de pago los define la base, nunca Claude.

alter table public.lucia_hostels
 add column payment_instructions text not null default '' check(length(payment_instructions)<=2000),
 add column deposit_percent smallint not null default 50 check(deposit_percent between 1 and 100),
 add column hold_minutes smallint not null default 60 check(hold_minutes between 15 and 1440);
grant update(payment_instructions,deposit_percent,hold_minutes) on public.lucia_hostels to authenticated;

alter table public.lucia_conversations
 add column booking_status text not null default 'none' check(booking_status in('none','awaiting_reception','awaiting_payment','proof_received','confirmed','expired','rejected')),
 add column booking_code text check(booking_code is null or booking_code ~ '^[0-9]{4}$'),
 add column booking_requested_at timestamptz,
 add column booking_room_id uuid references public.lodging_rooms(id),
 add column booking_confirmed_by uuid references public.profiles(id),
 add column booking_confirmed_via text check(booking_confirmed_via is null or booking_confirmed_via in('erp','whatsapp')),
 add column booking_confirmed_at timestamptz,
 add column hold_expires_at timestamptz,
 add column booking_total numeric(14,2) check(booking_total is null or booking_total>=0),
 add column booking_deposit numeric(14,2) check(booking_deposit is null or booking_deposit>=0),
 add column proof_received_at timestamptz,
 add column payment_verified_by uuid references public.profiles(id),
 add column payment_verified_at timestamptz;
create index lucia_conversations_booking_idx on public.lucia_conversations(company_id,booking_status,hold_expires_at) where booking_status<>'none';

-- Mensajes del número central al equipo (encargados): no son conversaciones
-- con clientes, por eso no van en lucia_messages.
create table public.lucia_staff_messages(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid references public.lucia_conversations(id),
 to_phone text not null check(to_phone ~ '^\+[1-9][0-9]{7,14}$'),
 content text not null check(length(content) between 1 and 4000),
 delivery_status text not null default 'queued' check(delivery_status in('queued','sending','sent','failed')),
 attempts smallint not null default 0,
 external_id text,
 error_message text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lucia_staff_messages_outbox_idx on public.lucia_staff_messages(company_id,created_at) where delivery_status='queued';
create index lucia_staff_messages_sent_idx on public.lucia_staff_messages(company_id,sent_at desc);
create index lucia_staff_messages_conversation_idx on public.lucia_staff_messages(conversation_id,created_at);
alter table public.lucia_staff_messages enable row level security;
create policy lucia_staff_messages_read on public.lucia_staff_messages for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lucia.inbox.view')
);
grant select on public.lucia_staff_messages to authenticated;
grant select,insert,update on public.lucia_staff_messages to service_role;

-- ===== Funciones internas =====

-- Misma regla que rateForGuests (src/modules/lodging/domain/reservations.ts):
-- tarifa exacta por personas; si no hay, la mayor definida por debajo; si
-- tampoco, la menor; sin tarifas por personas, la tarifa base.
create or replace function public.lucia_rate_for_guests(base_rate numeric,rates jsonb,guests integer) returns numeric language sql immutable set search_path='' as $$
 with r as (
  select key::int as n,value::numeric as v from jsonb_each_text(coalesce(rates,'{}'::jsonb))
  where key ~ '^[0-9]+$' and key::int>0 and value ~ '^[0-9]+(\.[0-9]+)?$' and value::numeric>0
 )
 select coalesce(
  (select v from r where n=guests),
  (select v from r where n<guests order by n desc limit 1),
  (select v from r order by n limit 1),
  base_rate)
$$;

create or replace function public.lucia_clp(amount numeric) returns text language sql immutable set search_path='' as $$
 select '$'||replace(to_char(round(amount),'FM999,999,999,990'),',','.')
$$;

create or replace function public.lucia_notify_unit(c public.lucia_conversations,ekey text,ttl text,msg text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select c.company_id,c.business_unit_id,p.id,ekey,ttl,msg,'lucia_conversation',c.id,null
 from public.profiles p
 join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=c.company_id and ubu.business_unit_id=c.business_unit_id
 where p.active and p.deleted_at is null
  and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=p.role_id and perm.key='lucia.inbox.reply' and perm.active)
  and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.event_key=ekey and n.entity_id=c.id and n.status='unread');
end $$;
revoke execute on function public.lucia_notify_unit(public.lucia_conversations,text,text,text) from public,anon,authenticated;

create or replace function public.lucia_message_manager(c public.lucia_conversations,body text) returns void language plpgsql security definer set search_path='' as $$
declare phone text;
begin
 select manager_phone into phone from public.lucia_hostels where company_id=c.company_id and business_unit_id=c.business_unit_id;
 if phone is null or c.channel<>'whatsapp' then return; end if;
 insert into public.lucia_staff_messages(company_id,business_unit_id,conversation_id,to_phone,content)
 values(c.company_id,c.business_unit_id,c.id,phone,left(body,4000));
end $$;
revoke execute on function public.lucia_message_manager(public.lucia_conversations,text) from public,anon,authenticated;

create or replace function public.lucia_booking_summary(c public.lucia_conversations) returns text language sql stable security definer set search_path='' as $$
 select concat_ws(E'\n',
  '👤 '||coalesce(c.guest_name,c.contact_name,'Sin nombre')||coalesce(' · '||c.contact_phone,''),
  '📅 '||to_char(c.check_in,'DD-MM-YYYY')||' al '||to_char(c.check_out,'DD-MM-YYYY')||' ('||(c.check_out-c.check_in)||' noche'||case when c.check_out-c.check_in=1 then '' else 's' end||')',
  '👥 '||c.guests||' persona'||case when c.guests=1 then '' else 's' end,
  '🛏️ '||coalesce(c.room_type,'Habitación por definir'))
$$;
revoke execute on function public.lucia_booking_summary(public.lucia_conversations) from public,anon,authenticated;

-- Habitación libre de la hostal para la estadía: admite a todas las personas,
-- no está en mantención y no se cruza con ninguna reserva vigente (tampoco
-- las importadas por iCal). Prefiere el tipo que eligió el cliente y la más
-- económica.
create or replace function public.lucia_pick_room(c public.lucia_conversations) returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.lodging_rooms r
 where r.business_unit_id=c.business_unit_id and r.active and r.status not in('maintenance','out_of_service') and r.capacity>=c.guests
  and not exists(select 1 from public.lodging_reservations x where x.room_id=r.id and x.status not in('cancelled','conflict')
    and x.check_in<c.check_out and x.check_out>c.check_in)
 order by (c.room_type is not null and c.room_type ilike r.room_type||'%') desc,
  public.lucia_rate_for_guests(r.base_rate,r.rates_by_guests,c.guests),r.display_order,r.code
 limit 1
$$;
revoke execute on function public.lucia_pick_room(public.lucia_conversations) from public,anon,authenticated;

-- Recepción confirmó: crea la reserva pendiente, guarda la habitación y envía
-- al cliente montos y datos de pago. Devuelve error legible si no se puede.
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
 deposit:=round(total*h.deposit_percent/100.0);

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
   case when deposit<total then '🔒 Para confirmar la reserva puedes abonar el '||h.deposit_percent||'% ('||public.lucia_clp(deposit)||') o pagar el total.' else '🔒 Para confirmar la reserva se paga el total.' end||E'\n\n'||
   case when length(trim(h.payment_instructions))>0 then '🏦 Datos para transferir:'||E'\n'||trim(h.payment_instructions)||E'\n\n' else '' end||
   '📸 Cuando transfieras, envíame el comprobante por aquí. Te guardo la habitación por '||
   case when h.hold_minutes>=60 and h.hold_minutes%60=0 then (h.hold_minutes/60)||' hora'||case when h.hold_minutes=60 then '' else 's' end else h.hold_minutes||' minutos' end||' 😊',
   null);
 perform public.lucia_message_manager(c,'✅ Disponibilidad confirmada'||case when via='whatsapp' then ' por WhatsApp' else ' en el ERP' end||'. Se envió al cliente el monto y los datos de pago; la habitación queda guardada '||h.hold_minutes||' min.'||E'\n'||public.lucia_booking_summary(c));
 return jsonb_build_object('ok',true,'reservation_id',rid,'room_id',room,'total',total,'deposit',deposit);
end $$;
revoke execute on function public.lucia_booking_confirm_internal(uuid,uuid,text,uuid) from public,anon,authenticated;

create or replace function public.lucia_booking_reject_internal(target_conversation uuid,via text,actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 select * into c from public.lucia_conversations where id=target_conversation for update;
 if not found then raise exception 'Conversación no encontrada'; end if;
 if c.booking_status<>'awaiting_reception' then raise exception 'Esta solicitud ya fue respondida'; end if;
 update public.lucia_conversations set booking_status='rejected',booking_confirmed_by=actor,booking_confirmed_via=via,booking_confirmed_at=now(),
   prospect_status='quoted',updated_at=now() where id=c.id returning * into c;
 perform public.lucia_enqueue_outbound(c,'lucia',null,
   '🙏 Lo siento, recepción me indica que esa opción ya no está disponible para esas fechas. ¿Quieres que revise otra habitación, otra hostal u otras fechas?',null);
end $$;
revoke execute on function public.lucia_booking_reject_internal(uuid,text,uuid) from public,anon,authenticated;

-- ===== service_role: lo llama el procesamiento de Lucía =====

create or replace function public.lucia_request_booking(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; code text; link text;
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
 code:=lpad((floor(random()*9000)+1000)::int::text,4,'0');
 update public.lucia_conversations set booking_status='awaiting_reception',booking_code=code,booking_requested_at=now(),
   booking_room_id=null,hold_expires_at=null,booking_total=null,booking_deposit=null,proof_received_at=null,
   prospect_status='pre_reserved',updated_at=now()
 where id=c.id returning * into c;
 link:=nullif(rtrim(payload->>'app_url','/'),'')||'/lodging/lucia/'||c.id;
 perform public.lucia_message_manager(c,'🔔 Nueva solicitud de reserva por WhatsApp'||E'\n'||public.lucia_booking_summary(c)||E'\n\n'||
   '¿Hay disponibilidad? Responde *OK '||code||'* para confirmar o *NO '||code||'* si no hay.'||coalesce(E'\n'||'O revisa la ficha: '||link,''));
 perform public.lucia_notify_unit(c,'lucia.booking_requested','Lucía: confirmar disponibilidad',
   coalesce(c.guest_name,c.contact_name,'Un cliente')||' quiere reservar del '||to_char(c.check_in,'DD-MM')||' al '||to_char(c.check_out,'DD-MM')||' ('||c.guests||' pers.). Confirma la disponibilidad.');
 return jsonb_build_object('ok',true,'code',code);
end $$;
revoke execute on function public.lucia_request_booking(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_request_booking(jsonb) to service_role;

-- Anula reservas pendientes cuyo plazo venció sin comprobante (lo llama el
-- worker cada minuto).
create or replace function public.lucia_expire_holds(target_company uuid) returns integer language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; n int:=0;
begin
 for c in select * from public.lucia_conversations where company_id=target_company and booking_status='awaiting_payment' and hold_expires_at<now() for update skip locked loop
   update public.lodging_reservations set status='cancelled',cancelled_at=now(),cancellation_reason='Venció el plazo para el abono por WhatsApp'
   where id=c.reservation_id and status='pending';
   update public.lucia_conversations set booking_status='expired',prospect_status='quoted',updated_at=now() where id=c.id returning * into c;
   perform public.lucia_enqueue_outbound(c,'lucia',null,
     '⏰ Se cumplió el plazo para el abono y liberamos la habitación. Si aún te interesa, avísame y vuelvo a revisar la disponibilidad 😊',null);
   perform public.lucia_message_manager(c,'⏰ Venció el plazo de abono y se anuló la reserva pendiente.'||E'\n'||public.lucia_booking_summary(c));
   n:=n+1;
 end loop;
 return n;
end $$;
revoke execute on function public.lucia_expire_holds(uuid) from public,anon,authenticated;
grant execute on function public.lucia_expire_holds(uuid) to service_role;

-- ===== Usuarios del ERP =====

create or replace function public.lucia_booking_confirm(target_conversation uuid,target_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if not c.hostel_assigned or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Hostal no autorizada'; end if;
 return public.lucia_booking_confirm_internal(c.id,target_room,'erp',auth.uid());
end $$;

create or replace function public.lucia_booking_reject(target_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if not c.hostel_assigned or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Hostal no autorizada'; end if;
 perform public.lucia_booking_reject_internal(c.id,'erp',auth.uid());
end $$;

-- El encargado revisó el pago en el banco: registra el pago, confirma la
-- reserva y avisa al cliente.
create or replace function public.lucia_verify_payment(target_conversation uuid,paid_amount numeric,operation text) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Hostal no autorizada'; end if;
 if c.booking_status not in('awaiting_payment','proof_received') then raise exception 'No hay un pago pendiente en esta conversación'; end if;
 if paid_amount is null or paid_amount<=0 then raise exception 'Indica el monto recibido'; end if;
 if not exists(select 1 from public.lodging_reservations where id=c.reservation_id and status='pending') then
   raise exception 'La reserva pendiente ya no está vigente (pudo vencer o anularse)';
 end if;
 insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,operation_number,notes,registered_by)
 values(c.company_id,c.business_unit_id,c.reservation_id,case when paid_amount>=c.booking_total then 'total' else 'deposit' end,'transfer',paid_amount,
   nullif(trim(operation),''),'Pago por transferencia recibido vía WhatsApp (Lucía)',auth.uid());
 update public.lodging_reservations set status='confirmed',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=c.reservation_id;
 update public.lucia_conversations set booking_status='confirmed',prospect_status='confirmed',hold_expires_at=null,
   payment_verified_by=auth.uid(),payment_verified_at=now(),needs_review=false,review_reason=null,updated_at=now()
 where id=c.id returning * into c;
 perform public.lucia_enqueue_outbound(c,'lucia',null,
   '🎉 ¡Recibimos tu pago de '||public.lucia_clp(paid_amount)||' y tu reserva quedó confirmada!'||E'\n'||public.lucia_booking_summary(c)||E'\n\n'||
   case when paid_amount<c.booking_total then 'El saldo de '||public.lucia_clp(c.booking_total-paid_amount)||' se paga al llegar. ' else '' end||
   '¡Te esperamos! 🙌',null);
end $$;

grant execute on function public.lucia_booking_confirm(uuid,uuid),public.lucia_booking_reject(uuid),public.lucia_verify_payment(uuid,numeric,text) to authenticated;
revoke execute on function public.lucia_booking_confirm(uuid,uuid),public.lucia_booking_reject(uuid),public.lucia_verify_payment(uuid,numeric,text) from public,anon;

-- ===== Cola de salida: clientes y equipo =====

create or replace function public.lucia_claim_outbound(target_company uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lucia_settings; m public.lucia_messages; sm public.lucia_staff_messages; recent integer; jid text;
begin
 select * into strict s from public.lucia_settings where company_id=target_company;
 if s.connection_status<>'connected' then return null; end if;
 select (select count(*) from public.lucia_messages lm join public.lucia_conversations lc on lc.id=lm.conversation_id
          where lm.company_id=target_company and lc.channel='whatsapp' and lm.direction='outbound'
            and lm.sender_type in('lucia','human') and lm.sent_at>now()-interval '1 minute' and lm.delivery_status in('sent','sending'))
      + (select count(*) from public.lucia_staff_messages where company_id=target_company and sent_at>now()-interval '1 minute' and delivery_status in('sent','sending'))
 into recent;
 if recent>=s.max_messages_per_minute then return null; end if;
 -- Un mensaje que quedó "enviando" por más de 2 minutos (worker caído) vuelve a la cola.
 update public.lucia_messages set delivery_status='queued' where company_id=target_company and delivery_status='sending' and sent_at<now()-interval '2 minutes';
 update public.lucia_staff_messages set delivery_status='queued' where company_id=target_company and delivery_status='sending' and sent_at<now()-interval '2 minutes';

 select * into m from public.lucia_messages where company_id=target_company and delivery_status='queued' order by created_at for update skip locked limit 1;
 if found then
   if m.attempts>=3 then
     update public.lucia_messages set delivery_status='failed',error_message=coalesce(error_message,'Se agotaron los reintentos') where id=m.id;
     return null;
   end if;
   select contact_jid into jid from public.lucia_conversations where id=m.conversation_id;
   update public.lucia_messages set delivery_status='sending',attempts=attempts+1,sent_at=now() where id=m.id;
   return jsonb_build_object('kind','customer','id',m.id,'conversation_id',m.conversation_id,'jid',jid,'content',m.content);
 end if;

 select * into sm from public.lucia_staff_messages where company_id=target_company and delivery_status='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if sm.attempts>=3 then
   update public.lucia_staff_messages set delivery_status='failed',error_message=coalesce(error_message,'Se agotaron los reintentos') where id=sm.id;
   return null;
 end if;
 update public.lucia_staff_messages set delivery_status='sending',attempts=attempts+1,sent_at=now() where id=sm.id;
 return jsonb_build_object('kind','staff','id',sm.id,'conversation_id',sm.conversation_id,'jid',substr(sm.to_phone,2)||'@s.whatsapp.net','content',sm.content);
end $$;

create or replace function public.lucia_mark_outbound(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.lucia_messages; sm public.lucia_staff_messages; ok boolean:=coalesce((payload->>'ok')::boolean,false);
begin
 if payload->>'kind'='staff' then
   select * into strict sm from public.lucia_staff_messages where id=nullif(payload->>'id','')::uuid for update;
   update public.lucia_staff_messages set
     delivery_status=case when ok then 'sent' when sm.attempts>=3 then 'failed' else 'queued' end,
     external_id=coalesce(nullif(payload->>'external_id',''),external_id),
     error_message=case when ok then null else left(payload->>'error',500) end,
     sent_at=case when ok then now() else sent_at end
   where id=sm.id;
   if not ok then
     perform public.lucia_log(sm.company_id,sm.conversation_id,'error','staff_send_failed',coalesce(payload->>'error','No se pudo avisar al encargado'),jsonb_build_object('staff_message_id',sm.id));
   end if;
   return;
 end if;
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

-- ===== Ingesta: respuestas de encargados y comprobantes =====

create or replace function public.lucia_ingest_message(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.lucia_settings;
 conv public.lucia_conversations;
 target public.lucia_conversations;
 mid uuid;
 jid text:=nullif(trim(payload->>'jid'),'');
 phone text:=nullif(trim(payload->>'phone'),'');
 ext text:=nullif(trim(payload->>'external_id'),'');
 mtype text:=coalesce(nullif(payload->>'message_type',''),'text');
 body text:=nullif(payload->>'content','');
 pname text:=nullif(trim(payload->>'push_name'),'');
 from_me boolean:=coalesce((payload->>'from_me')::boolean,false);
 cmd text[];
 link text:=nullif(rtrim(payload->>'app_url','/'),'');
begin
 select * into s from public.lucia_settings where company_id=nullif(payload->>'company_id','')::uuid;
 if not found then return jsonb_build_object('status','not_configured'); end if;
 if jid is null then raise exception 'Falta el identificador del chat'; end if;
 if phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$' then phone:=null; end if;
 if mtype not in('text','audio','image','video','document','sticker','location','contact','other') then mtype:='other'; end if;

 -- Respuesta de un encargado a una solicitud: "OK 1234" o "NO 1234".
 if not from_me and phone is not null and body is not null then
   cmd:=regexp_match(lower(trim(body)),'^(ok|si|sí|no)\W*#?\s*([0-9]{4})\W*$');
   if cmd is not null then
     select c.* into target from public.lucia_conversations c
     join public.lucia_hostels h on h.company_id=c.company_id and h.business_unit_id=c.business_unit_id
     where c.company_id=s.company_id and c.booking_code=cmd[2] and h.manager_phone=phone
     order by c.booking_requested_at desc limit 1;
     if found then
       -- Vale la primera respuesta (ERP o WhatsApp); las demás solo se informan.
       begin
         if target.booking_status<>'awaiting_reception' then
           raise exception 'La solicitud % ya había sido respondida',cmd[2];
         elsif cmd[1]='no' then
           perform public.lucia_booking_reject_internal(target.id,'whatsapp',null);
           insert into public.lucia_staff_messages(company_id,business_unit_id,conversation_id,to_phone,content)
           values(target.company_id,target.business_unit_id,target.id,phone,'👍 Anotado: sin disponibilidad. Ya le avisé al cliente.');
         else
           perform public.lucia_booking_confirm_internal(target.id,null,'whatsapp',null);
         end if;
       exception when others then
         insert into public.lucia_staff_messages(company_id,business_unit_id,conversation_id,to_phone,content)
         values(target.company_id,target.business_unit_id,target.id,phone,'ℹ️ '||sqlerrm||'. Revisa la ficha en el ERP.');
       end;
       return jsonb_build_object('status','manager_command','conversation_id',target.id,'process',false);
     end if;
   end if;
 end if;

 if phone is not null and exists(select 1 from public.lucia_excluded_contacts e where e.company_id=s.company_id and e.phone_e164=phone) then
   return jsonb_build_object('status','excluded');
 end if;
 if ext is not null and exists(select 1 from public.lucia_messages m where m.company_id=s.company_id and m.external_id=ext) then
   return jsonb_build_object('status','duplicate');
 end if;
 if ext is not null and exists(select 1 from public.lucia_staff_messages m where m.company_id=s.company_id and m.external_id=ext) then
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

 -- Comprobante de pago: la habitación se sigue guardando hasta que el
 -- encargado lo revise.
 if conv.booking_status='awaiting_payment' and mtype in('image','document') then
   update public.lucia_conversations set booking_status='proof_received',proof_received_at=now(),hold_expires_at=null,
     needs_review=true,review_reason='Comprobante de pago recibido: verificar en el banco',updated_at=now()
   where id=conv.id returning * into conv;
   perform public.lucia_message_manager(conv,'💸 El cliente envió el comprobante de pago. Verifícalo en el banco y presiona "Pago verificado" en el ERP.'||E'\n'||
     public.lucia_booking_summary(conv)||E'\n'||'Monto a recibir: abono '||public.lucia_clp(conv.booking_deposit)||' o total '||public.lucia_clp(conv.booking_total)||
     coalesce(E'\n'||link||'/lodging/lucia/'||conv.id,''));
   perform public.lucia_notify_unit(conv,'lucia.payment_proof','Lucía: comprobante de pago recibido',
     coalesce(conv.guest_name,conv.contact_name,'Un cliente')||' envió el comprobante. Verifica el pago y confirma la reserva.');
   return jsonb_build_object('status','payment_proof','conversation_id',conv.id,'message_id',mid,
     'process',conv.status='lucia' and (conv.paused_until is null or conv.paused_until<now()));
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
