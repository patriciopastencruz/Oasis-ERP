\set ON_ERROR_STOP on
begin;

-- La opción elegida define la habitación asignada, y un cambio de hostal con
-- la solicitud esperando a recepción la anula y avisa al encargado.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hob from public.business_units where company_id=:'company_id' and code='HOB' \gset
\set cheap '00000000-0000-4000-8000-0000000c3001'
\set private '00000000-0000-4000-8000-0000000c3002'
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,room_type,description,capacity,base_rate,rates_by_guests,display_order)
values(:'cheap',:'company_id',:'hu','LO1','Compartida','Habitación','2 camas, baño compartido',2,22000,'{"1":22000,"2":28000}',990),
      (:'private',:'company_id',:'hu','LO2','Privada','Habitación','1 cama matrimonial, baño privado',2,26000,'{"1":26000,"2":30000}',991);
insert into public.lodging_rooms(company_id,business_unit_id,code,name,room_type,capacity,base_rate,display_order)
values(:'company_id',:'hob','LO3','Mini prueba','Mini depto',2,27000,992);
update public.lucia_hostels set manager_phone='+56970000011' where business_unit_id=:'hu';
update public.lucia_hostels set manager_phone='+56970000012' where business_unit_id=:'hob';

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.private',:'private',true);
set local role service_role;
do $$
declare company uuid:=current_setting('lucia.company')::uuid; priv uuid:=current_setting('lucia.private')::uuid; r jsonb; conv uuid; c public.lucia_conversations; ci date:=current_date+60; code text;
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56985555555@s.whatsapp.net','phone','+56985555555','external_id','Q1','content','La privada'));
  conv:=(r->>'conversation_id')::uuid;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Perfecto','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('guest_name','Ana','check_in',ci,'check_out',ci+2,'guests',2,'hostel_code','HU','option_code',priv,
      'room_type','Habitación: 1 cama matrimonial, baño privado')));
  if (select preferred_room_id from public.lucia_conversations where id=conv)<>priv then raise exception 'Debe guardarse la opción elegida'; end if;
  code:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv))->>'code';

  -- El cliente se cambia a Cobija antes de que recepción responda.
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Cambio a Cobija','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('hostel_code','HOB','room_type','Mini depto')));
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_status<>'none' or c.booking_code is not null then raise exception 'La solicitud anterior debía anularse: %',c.booking_status; end if;
  if not exists(select 1 from public.lucia_staff_messages where to_phone='+56970000011' and content like '%'||code||'% quedó sin efecto%') then
    raise exception 'Debía avisarse al encargado de Uruguay';
  end if;
  -- Un OK tardío al código anulado no crea reserva.
  perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000011@s.whatsapp.net','phone','+56970000011','external_id','Q2','content','OK '||code));
  if (select reservation_id from public.lucia_conversations where id=conv) is not null then raise exception 'Un código anulado no debe crear reserva'; end if;

  -- Vuelve a Uruguay con la opción privada: se asigna esa habitación, no la más barata.
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Mejor Uruguay','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('hostel_code','HU','option_code',priv,'room_type','Habitación: 1 cama matrimonial, baño privado')));
  code:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv))->>'code';
  perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000011@s.whatsapp.net','phone','+56970000011','external_id','Q3','content','OK '||code));
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_room_id<>priv or c.booking_total<>60000 then raise exception 'Debía asignarse la habitación privada (% / %)',c.booking_room_id,c.booking_total; end if;

  -- Con la reserva pendiente creada, un cambio no se aplica solo.
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Quiero cambiar fechas','intent','other','needs_human',false,
    'extracted',jsonb_build_object('check_in',ci+10,'check_out',ci+12)));
  select * into c from public.lucia_conversations where id=conv;
  if c.check_in<>ci or not c.needs_review then raise exception 'Con reserva creada no se cambian fechas y queda para revisión'; end if;
end $$;

select 'lucia option change ok' as result;
rollback;
