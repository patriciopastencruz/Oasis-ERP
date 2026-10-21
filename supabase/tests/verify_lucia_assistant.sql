\set ON_ERROR_STOP on
begin;

-- Verifica el flujo de Lucía (etapa 1): filtro de contactos excluidos,
-- idempotencia, pausa de 12 h cuando el equipo escribe desde el teléfono,
-- audios a revisión humana, borradores con ficha y hostal, visibilidad por
-- hostal, envío solo con aprobación, tope de gasto y límite por minuto.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
select id as hob from public.business_units where company_id=:'company_id' and code='HOB' \gset
\set manager '00000000-0000-4000-8000-0000000c1001'
\set rec_centro '00000000-0000-4000-8000-0000000c1002'
\set rec_cobija '00000000-0000-4000-8000-0000000c1003'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'manager','authenticated','authenticated','lucia-manager@local.test','x',now(),now(),now()),
 (:'rec_centro','authenticated','authenticated','lucia-centro@local.test','x',now(),now(),now()),
 (:'rec_cobija','authenticated','authenticated','lucia-cobija@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'manager',(select id from public.roles where key='general_manager'),'Gerente','Lucía','lucia-manager@local.test','Pruebas',:'manager'),
 (:'rec_centro',(select id from public.roles where key='receptionist'),'Recepción','Centro','lucia-centro@local.test','Pruebas',:'rec_centro'),
 (:'rec_cobija',(select id from public.roles where key='receptionist'),'Recepción','Cobija','lucia-cobija@local.test','Pruebas',:'rec_cobija');
insert into public.user_companies(user_id,company_id) values(:'manager',:'company_id'),(:'rec_centro',:'company_id'),(:'rec_cobija',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'manager',:'company_id',:'hu'),(:'manager',:'company_id',:'hoc'),(:'manager',:'company_id',:'hob'),
 (:'rec_centro',:'company_id',:'hoc'),(:'rec_cobija',:'company_id',:'hob');

do $$
begin
  if (select count(*) from public.lucia_hostels) is distinct from 3::bigint then raise exception 'Deben existir las 3 hostales de Lucía'; end if;
  if (select bu.code from public.lucia_settings s join public.business_units bu on bu.id=s.business_unit_id) is distinct from 'HU' then raise exception 'La unidad base de Lucía debe ser HU'; end if;
end $$;

insert into public.lucia_excluded_contacts(company_id,business_unit_id,phone_e164,label,category)
values(:'company_id',:'hu','+56911111111','Mamá','familia');

set local role service_role;
select set_config('lucia.company',:'company_id',true);
do $$
declare r jsonb; conv uuid; c public.lucia_conversations; company uuid:=current_setting('lucia.company')::uuid; did uuid;
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56911111111@s.whatsapp.net','phone','+56911111111','external_id','EX1','content','Hola hijo'));
  if r->>'status'<>'excluded' then raise exception 'Un contacto excluido no debe registrarse: %',r; end if;
  if exists(select 1 from public.lucia_messages where external_id='EX1') then raise exception 'Se guardó un mensaje de un contacto excluido'; end if;

  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56922222222@s.whatsapp.net','phone','+56922222222','external_id','M1','push_name','Ana','content','Hola, ¿tienen pieza doble para el 10 de noviembre?'));
  if r->>'status'<>'ok' or (r->>'process')::boolean is not true then raise exception 'El primer mensaje debe procesarse: %',r; end if;
  conv:=(r->>'conversation_id')::uuid;
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56922222222@s.whatsapp.net','phone','+56922222222','external_id','M1','content','Hola, ¿tienen pieza doble para el 10 de noviembre?'));
  if r->>'status'<>'duplicate' then raise exception 'Un mensaje repetido no debe guardarse dos veces'; end if;
  select * into c from public.lucia_conversations where id=conv;
  if c.hostel_assigned or c.unanswered_since is null or c.contact_name<>'Ana' then raise exception 'Conversación inicial incorrecta'; end if;

  did:=public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','¡Hola Ana! Soy Lucía. ¿Para cuántas noches sería?','intent','availability',
    'needs_human',false,'model','claude-haiku-4-5','input_tokens',1200,'output_tokens',90,
    'extracted',jsonb_build_object('guest_name','Ana Pérez','check_in','2026-11-10','check_out','2026-11-08','guests',2,'room_type','Doble','hostel_code','HOC')));
  select * into c from public.lucia_conversations where id=conv;
  if not c.hostel_assigned or c.business_unit_id<>(select id from public.business_units where code='HOC' and company_id=company) then raise exception 'La conversación debía quedar en Hostal Centro'; end if;
  if c.check_in<>'2026-11-10' or c.check_out is not null or c.guests<>2 or c.guest_name<>'Ana Pérez' then raise exception 'Ficha mal completada: %',row_to_json(c); end if;
  if exists(select 1 from public.lucia_messages where conversation_id=conv and direction='outbound') then raise exception 'En modo borrador nada debe enviarse solo'; end if;
  if (select business_unit_id from public.lucia_messages where external_id='M1')<>c.business_unit_id then raise exception 'Los mensajes deben seguir a la hostal asignada'; end if;

  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56922222222@s.whatsapp.net','phone','+56922222222','external_id','M2','message_type','audio'));
  if r->>'status'<>'needs_review' then raise exception 'Un audio debe quedar para revisión humana'; end if;
  if not (select needs_review from public.lucia_conversations where id=conv) then raise exception 'Falta la marca de revisión humana'; end if;

  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56933333333@s.whatsapp.net','phone','+56933333333','external_id','T1','push_name','Equipo','from_me',true,'content','Te escribo yo'));
  if r->>'status'<>'team_message' then raise exception 'Un mensaje desde el teléfono debe tratarse como del equipo'; end if;
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56933333333@s.whatsapp.net','phone','+56933333333','external_id','T2','content','Gracias'));
  if (r->>'process')::boolean then raise exception 'Lucía debía quedar pausada 12 h en ese chat'; end if;
  if (select paused_until from public.lucia_conversations where id=(r->>'conversation_id')::uuid)<now()+interval '11 hours' then raise exception 'La pausa debe durar 12 h'; end if;
end $$;

-- Visibilidad por hostal
reset role;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',:'rec_cobija','role','authenticated')::text,true);
do $$
begin
  if exists(select 1 from public.lucia_conversations where contact_phone='+56922222222') then raise exception 'Cobija no debe ver una conversación de Centro'; end if;
  if not exists(select 1 from public.lucia_conversations where contact_phone='+56933333333') then raise exception 'Una conversación sin hostal debe verse desde cualquier hostal'; end if;
  begin
    perform public.lucia_take_control((select id from public.lucia_conversations where contact_phone='+56933333333'));
  exception when others then raise exception 'Recepción debe poder tomar control de un chat sin hostal: %',sqlerrm;
  end;
  begin
    perform public.lucia_simulator_start('Prueba');
    raise exception 'Recepción no debe usar el simulador';
  exception when others then if sqlerrm not like '%autorizaci%' then raise; end if;
  end;
  begin
    perform public.lucia_connection_qr();
    raise exception 'Recepción no debe ver el QR';
  exception when others then if sqlerrm not like '%autorizaci%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims',json_build_object('sub',:'rec_centro','role','authenticated')::text,true);
do $$
declare conv uuid; d public.lucia_drafts; mid uuid;
begin
  select id into conv from public.lucia_conversations where contact_phone='+56922222222';
  if conv is null then raise exception 'Centro debe ver su conversación'; end if;
  select * into d from public.lucia_drafts where conversation_id=conv and status='pending';
  mid:=public.lucia_send_draft(d.id,'¡Hola Ana! Soy Lucía 😊 ¿Cuántas noches?');
  if (select delivery_status from public.lucia_messages where id=mid)<>'queued' then raise exception 'WhatsApp debe quedar en cola para el worker'; end if;
  if not (select edited from public.lucia_drafts where id=d.id) then raise exception 'Debe registrarse que el borrador se editó'; end if;
  begin
    perform public.lucia_send_draft(d.id,null);
    raise exception 'No se puede enviar dos veces el mismo borrador';
  exception when others then if sqlerrm not like '%ya fue enviado%' then raise; end if;
  end;
  begin
    update public.lucia_conversations set prospect_status='confirmed' where id=conv;
  exception when insufficient_privilege then null;
  end;
  if (select prospect_status from public.lucia_conversations where id=conv)='confirmed' then raise exception 'La ficha solo se edita por función'; end if;
  perform public.lucia_update_prospect(conv,'{"prospect_status":"quoted","quoted_amount":"45000"}');
  if (select quoted_amount from public.lucia_conversations where id=conv)<>45000 then raise exception 'No se guardó el monto cotizado'; end if;
end $$;

-- Gerente: simulador, QR protegido
select set_config('request.jwt.claims',json_build_object('sub',:'manager','role','authenticated')::text,true);
do $$
declare conv uuid; mid uuid;
begin
  conv:=public.lucia_simulator_start('Turista de prueba');
  perform public.lucia_simulator_customer_message(conv,'Hola, ¿tienen estacionamiento?');
  if (select count(*) from public.lucia_messages where conversation_id=conv)<>1 then raise exception 'El simulador debe guardar el mensaje del cliente'; end if;
  mid:=public.lucia_send_reply(conv,'Hola, sí tenemos.');
  if (select delivery_status from public.lucia_messages where id=mid)<>'sent' then raise exception 'En el simulador el envío es inmediato'; end if;
  begin
    perform qr_code from public.lucia_settings;
    raise exception 'El QR no debe leerse directo de la tabla';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Tope de gasto y cola de salida
reset role;
set local role service_role;
do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; first jsonb; second jsonb;
begin
  update public.lucia_settings set daily_budget_usd=0.01,max_messages_per_minute=2 where company_id=company;
  r:=public.lucia_record_usage(jsonb_build_object('company_id',company,'input_tokens',5000,'output_tokens',200,'cost_usd',0.02));
  if not (r->>'over_budget')::boolean then raise exception 'Debía superar el tope'; end if;
  if (select budget_exceeded_on from public.lucia_settings where company_id=company) is null then raise exception 'Falta marcar el tope superado'; end if;
  if not exists(select 1 from public.notifications where event_key='lucia.budget_exceeded') then raise exception 'Debía avisarse del tope superado'; end if;

  if public.lucia_claim_outbound(company) is not null then raise exception 'Sin conexión no se envía nada'; end if;
  perform public.lucia_worker_status(jsonb_build_object('company_id',company,'status','connected','phone','+56900000000'));
  first:=public.lucia_claim_outbound(company);
  if first is null or first->>'jid'<>'56922222222@s.whatsapp.net' then raise exception 'Debía tomarse el mensaje en cola: %',first; end if;
  perform public.lucia_mark_outbound(jsonb_build_object('id',first->>'id','ok',true,'external_id','OUT1'));
  -- El mensaje enviado por el worker vuelve como "fromMe": no debe pausar a Lucía.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56922222222@s.whatsapp.net','external_id','OUT1','from_me',true,'content','x'));
  if r->>'status'<>'duplicate' then raise exception 'El eco de un mensaje propio no es del equipo: %',r; end if;
end $$;

select 'lucia assistant ok' as result;
rollback;
