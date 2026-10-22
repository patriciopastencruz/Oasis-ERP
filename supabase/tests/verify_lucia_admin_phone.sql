\set ON_ERROR_STOP on
begin;

-- WhatsApp del administrador: recibe los avisos de la solicitud junto con el
-- encargado y puede confirmar con "OK ####"; un número cualquiera no puede.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset

insert into public.lodging_rooms(company_id,business_unit_id,code,name,room_type,capacity,base_rate,rates_by_guests,display_order)
values(:'company_id',:'hoc','LA1','Prueba admin 1','Modulares',2,27000,'{"1":27000,"2":32000}',990);
update public.lucia_hostels set manager_phone='+56970000011',admin_phone='+56970000022',payment_instructions='Banco Prueba'
where business_unit_id=:'hoc';

select set_config('lucia.company',:'company_id',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; conv uuid; code text; ci date:=current_date+40;
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981111222@s.whatsapp.net','phone','+56981111222','external_id','AD1','push_name','Luis','content','Quiero reservar'));
  conv:=(r->>'conversation_id')::uuid;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Confirmo con recepción.','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('guest_name','Luis Pérez','check_in',ci,'check_out',ci+1,'guests',2,'room_type','Modulares','hostel_code','HOC')));
  r:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv,'app_url','https://erp.test'));
  if not (r->>'ok')::boolean then raise exception 'Debía crearse la solicitud: %',r; end if;
  code:=r->>'code';

  if (select count(distinct to_phone) from public.lucia_staff_messages where conversation_id=conv and content like '%OK '||code||'%'
      and to_phone in('+56970000011','+56970000022'))<>2 then
    raise exception 'El aviso debe llegar al encargado y al administrador';
  end if;

  -- Un número que no es ni encargado ni administrador no confirma.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000099@s.whatsapp.net','phone','+56970000099','external_id','AD2','content','ok '||code));
  if r->>'status'='manager_command' then raise exception 'Un número cualquiera no puede confirmar'; end if;

  -- El administrador confirma.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000022@s.whatsapp.net','phone','+56970000022','external_id','AD3','content','OK '||code));
  if r->>'status'<>'manager_command' then raise exception 'El administrador debe poder confirmar: %',r; end if;
  if (select booking_status from public.lucia_conversations where id=conv)<>'awaiting_payment' then raise exception 'La solicitud debía quedar confirmada'; end if;
end $$;

select 'lucia admin phone ok' as result;
rollback;
