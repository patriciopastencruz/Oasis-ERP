\set ON_ERROR_STOP on
begin;

-- Pago registrado directo en la reserva (no con "Pago verificado"): cuando
-- cubre el abono, la reserva de Lucía queda confirmada y se puede hacer
-- check-in. "Pago verificado" sigue enviando un solo mensaje al cliente.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set room1 '00000000-0000-4000-8000-0000000f2101'
\set room2 '00000000-0000-4000-8000-0000000f2102'

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,room_type,capacity,base_rate,rates_by_guests,display_order)
values(:'room1',:'company_id',:'hoc','PR1','Prueba pago 1','Modulares',2,22000,'{"1":22000}',990),
      (:'room2',:'company_id',:'hoc','PR2','Prueba pago 2','Modulares',2,22000,'{"1":22000}',991);
update public.lodging_rooms set active=false where business_unit_id=:'hoc' and id not in(:'room1',:'room2');
update public.lucia_hostels set manager_phone='+56970000401', admin_phones='{}', deposit_percent=50, full_payment_single_night=false where business_unit_id=:'hoc';

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.hoc',:'hoc',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; hoc uuid:=current_setting('lucia.hoc')::uuid;
  conv uuid; code text; c public.lucia_conversations; ci date:=current_date+10; i int;
begin
  for i in 1..2 loop
    conv:=(public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','5698126000'||i||'@s.whatsapp.net','phone','+5698126000'||i,
      'external_id','PI'||i,'push_name','Ulises','content','Quiero reservar'))->>'conversation_id')::uuid;
    perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Listo','intent','booking_intent','needs_human',false,
      'extracted',jsonb_build_object('guest_name','Ulises Prueba '||i,'check_in',ci,'check_out',ci+2,'guests',1,'room_type','Modulares','hostel_code','HOC')));
    code:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv))->>'code';
    perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000401@s.whatsapp.net','phone','+56970000401',
      'external_id','PO'||i,'content','ok '||code));
    perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','5698126000'||i||'@s.whatsapp.net','phone','+5698126000'||i,
      'external_id','PP'||i,'message_type','image'));
  end loop;

  -- Cliente 1: recepción registra pagos en la reserva. Medio abono no confirma; el abono completo sí.
  select * into c from public.lucia_conversations where contact_phone='+56981260001' and status<>'closed';
  insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount)
  values(company,hoc,c.reservation_id,'partial','transfer',10000);
  if (select status from public.lodging_reservations where id=c.reservation_id)<>'pending' then raise exception 'Medio abono no confirma'; end if;
  insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount)
  values(company,hoc,c.reservation_id,'partial','card',12000);
  if (select status from public.lodging_reservations where id=c.reservation_id)<>'confirmed' then raise exception 'Con el abono pagado la reserva queda confirmada'; end if;
  if (select booking_status from public.lucia_conversations where id=c.id)<>'confirmed' then raise exception 'El chat queda confirmado'; end if;
  if (select count(*) from public.lucia_messages where conversation_id=c.id and content like '🎉%')<>1 then raise exception 'Llegada futura: un mensaje de confirmación'; end if;
end $$;

-- Cliente 2: "Pago verificado" desde el ERP envía un solo mensaje.
reset role;
\set manager '00000000-0000-4000-8000-0000000f2001'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'manager','authenticated','authenticated','lucia-pago@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'manager',(select id from public.roles where key='receptionist'),'Recepción','Centro','lucia-pago@local.test','Pruebas',:'manager');
insert into public.user_companies(user_id,company_id) values(:'manager',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'manager',:'company_id',:'hoc');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',:'manager','role','authenticated')::text,true);
do $$
declare conv uuid;
begin
  select id into conv from public.lucia_conversations where contact_phone='+56981260002' and status<>'closed';
  perform public.lucia_verify_payment(conv,22000,'OP1');
end $$;
reset role;
do $$
begin
  if (select booking_status from public.lucia_conversations where contact_phone='+56981260002' and status<>'closed')<>'confirmed' then
    raise exception 'Pago verificado confirma';
  end if;
  if (select count(*) from public.lucia_messages m join public.lucia_conversations c on c.id=m.conversation_id
      where c.contact_phone='+56981260002' and m.content like '🎉%')<>1 then
    raise exception 'Pago verificado debe enviar un solo mensaje';
  end if;
end $$;

rollback;
