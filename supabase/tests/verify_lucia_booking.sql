\set ON_ERROR_STOP on
begin;

-- Flujo de cierre de venta: solicitud → recepción confirma (WhatsApp o ERP,
-- vale la primera) → reserva pendiente + datos de pago → comprobante →
-- pago verificado → reserva confirmada. También vencimiento del plazo.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set manager '00000000-0000-4000-8000-0000000c2001'
\set room1 '00000000-0000-4000-8000-0000000c2101'
\set room2 '00000000-0000-4000-8000-0000000c2102'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'manager','authenticated','authenticated','lucia-booking@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'manager',(select id from public.roles where key='receptionist'),'Recepción','Centro','lucia-booking@local.test','Pruebas',:'manager');
insert into public.user_companies(user_id,company_id) values(:'manager',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'manager',:'company_id',:'hoc');

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,room_type,capacity,base_rate,rates_by_guests,display_order)
values(:'room1',:'company_id',:'hoc','LB1','Prueba Lucía 1','Modulares',2,27000,'{"1":27000,"2":32000}',990),
      (:'room2',:'company_id',:'hoc','LB2','Prueba Lucía 2','Modulares',2,27000,'{"1":27000,"2":32000}',991);
update public.lucia_hostels set manager_phone='+56970000001',payment_instructions='Banco Prueba, cuenta corriente 123',deposit_percent=50,hold_minutes=60
where business_unit_id=:'hoc';
insert into public.lucia_excluded_contacts(company_id,business_unit_id,phone_e164,label,category)
select company_id,business_unit_id,'+56970000001','Encargado Centro','encargado' from public.lucia_settings;

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.manager',:'manager',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; conv uuid; code text; c public.lucia_conversations; ci date:=current_date+30;
begin
  if public.lucia_rate_for_guests(20000,'{"1":22000,"2":24000}',3)<>24000 then raise exception 'Tarifa: debe usar la mayor por debajo'; end if;
  if public.lucia_rate_for_guests(20000,null,2)<>20000 then raise exception 'Tarifa: sin tarifas por personas rige la base'; end if;
  if public.lucia_clp(1234567)<>'$1.234.567' then raise exception 'Formato CLP: %',public.lucia_clp(1234567); end if;

  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981111111@s.whatsapp.net','phone','+56981111111','external_id','K1','push_name','Carla','content','Quiero reservar'));
  conv:=(r->>'conversation_id')::uuid;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','¡Perfecto! Confirmo con recepción.','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('guest_name','Carla Soto','check_in',ci,'check_out',ci+2,'guests',2,'room_type','Modulares','hostel_code','HOC')));

  r:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv,'app_url','https://erp.test'));
  if not (r->>'ok')::boolean then raise exception 'Debía crearse la solicitud: %',r; end if;
  code:=r->>'code';
  if (select count(*) from public.lucia_staff_messages where conversation_id=conv and content like '%OK '||code||'%')<>1 then raise exception 'Debe avisarse al encargado con el código'; end if;
  r:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv));
  if (r->>'ok')::boolean then raise exception 'No se duplica una solicitud en curso'; end if;

  -- El encargado (aunque esté excluido) responde OK por WhatsApp.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000001@s.whatsapp.net','phone','+56970000001','external_id','M1','content','ok '||code));
  if r->>'status'<>'manager_command' then raise exception 'La respuesta del encargado debe tratarse como comando: %',r; end if;
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_status<>'awaiting_payment' or c.booking_total<>64000 or c.booking_deposit<>32000 or c.reservation_id is null then raise exception 'Confirmación incorrecta: %',row_to_json(c); end if;
  if (select status from public.lodging_reservations where id=c.reservation_id)<>'pending' then raise exception 'La reserva debe quedar pendiente'; end if;
  if c.hold_expires_at<now()+interval '59 minutes' then raise exception 'La habitación se guarda 1 hora'; end if;
  if not exists(select 1 from public.lucia_messages where conversation_id=conv and sender_type='lucia' and content like '%$64.000%' and content like '%$32.000%' and content like '%Banco Prueba%') then
    raise exception 'El cliente debe recibir total, abono y datos de pago';
  end if;

  -- Segunda respuesta: ya fue respondida, no crea otra reserva.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000001@s.whatsapp.net','phone','+56970000001','external_id','M2','content','OK '||code));
  if (select count(*) from public.lodging_reservations where room_id in('00000000-0000-4000-8000-0000000c2101','00000000-0000-4000-8000-0000000c2102') and status='pending')<>1 then raise exception 'Solo una reserva pendiente'; end if;
  if not exists(select 1 from public.lucia_staff_messages where conversation_id=conv and content like '%ya había sido respondida%') then raise exception 'Debe avisar que ya estaba respondida'; end if;

  -- El cliente envía el comprobante.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981111111@s.whatsapp.net','phone','+56981111111','external_id','K2','message_type','image'));
  if r->>'status'<>'payment_proof' then raise exception 'La imagen debe tomarse como comprobante: %',r; end if;
  if (select booking_status from public.lucia_conversations where id=conv)<>'proof_received' then raise exception 'Falta marcar comprobante recibido'; end if;
end $$;

-- Recepción verifica el pago en el ERP.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',:'manager','role','authenticated')::text,true);
do $$
declare conv uuid; c public.lucia_conversations;
begin
  select id into conv from public.lucia_conversations where contact_phone='+56981111111';
  perform public.lucia_verify_payment(conv,32000,'OP-1');
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_status<>'confirmed' or c.prospect_status<>'confirmed' then raise exception 'La reserva debía quedar confirmada'; end if;
  if (select status from public.lodging_reservations where id=c.reservation_id)<>'confirmed' then raise exception 'La reserva del ERP debe quedar confirmada'; end if;
  if (select type||':'||amount from public.lodging_reservation_payments where reservation_id=c.reservation_id)<>'deposit:32000.00' then raise exception 'Debe registrarse el abono'; end if;
end $$;

-- Rechazo desde el ERP y vencimiento del plazo.
reset role;
set local role service_role;
do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; conv uuid; c public.lucia_conversations; ci date:=current_date+40;
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56982222222@s.whatsapp.net','phone','+56982222222','external_id','L1','content','Reservo'));
  conv:=(r->>'conversation_id')::uuid;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Confirmo','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('guest_name','Luis','check_in',ci,'check_out',ci+1,'guests',2,'hostel_code','HOC')));
  r:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv));
  perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000001@s.whatsapp.net','phone','+56970000001','external_id','M3','content','Ok #'||(r->>'code')));
  if (select booking_status from public.lucia_conversations where id=conv)<>'awaiting_payment' then raise exception 'El OK con # también confirma'; end if;
  update public.lucia_conversations set hold_expires_at=now()-interval '1 minute' where id=conv;
  if public.lucia_expire_holds(company)<1 then raise exception 'Debía vencer la reserva pendiente'; end if;
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_status<>'expired' or (select status from public.lodging_reservations where id=c.reservation_id)<>'cancelled' then raise exception 'Al vencer se anula la reserva pendiente'; end if;

  -- Cola: los avisos al encargado también salen por el worker.
  perform public.lucia_worker_status(jsonb_build_object('company_id',company,'status','connected'));
  update public.lucia_settings set max_messages_per_minute=30 where company_id=company;
  update public.lucia_messages set delivery_status='sent',sent_at=now()-interval '1 hour' where company_id=company and delivery_status='queued';
  r:=public.lucia_claim_outbound(company);
  if r->>'kind'<>'staff' or r->>'jid' not like '569%@s.whatsapp.net' then raise exception 'Debía tomarse un aviso al encargado: %',r; end if;
  perform public.lucia_mark_outbound(jsonb_build_object('kind','staff','id',r->>'id','ok',true,'external_id','S1'));
  if (select delivery_status from public.lucia_staff_messages where id=(r->>'id')::uuid)<>'sent' then raise exception 'Aviso no marcado como enviado'; end if;
end $$;

select 'lucia booking ok' as result;
rollback;
