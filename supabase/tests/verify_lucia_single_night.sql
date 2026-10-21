\set ON_ERROR_STOP on
begin;

-- Cobija: 1 noche se paga completa; 2 o más noches, abono del 50%.

select id as company_id from public.companies where code='OASIS' \gset
select id as hob from public.business_units where company_id=:'company_id' and code='HOB' \gset
insert into public.lodging_rooms(company_id,business_unit_id,code,name,room_type,capacity,base_rate,rates_by_guests,display_order)
values(:'company_id',:'hob','LS1','Prueba 1 noche','Mini depto',2,27000,'{"1":27000,"2":32000}',990),
      (:'company_id',:'hob','LS2','Prueba 2 noches','Mini depto',2,27000,'{"1":27000,"2":32000}',991);
update public.lucia_hostels set manager_phone='+56970000009' where business_unit_id=:'hob';

select set_config('lucia.company',:'company_id',true);
set local role service_role;
do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; conv uuid; c public.lucia_conversations; ci date:=current_date+50; n int;
begin
  if not (select full_payment_single_night from public.lucia_hostels h join public.business_units bu on bu.id=h.business_unit_id where bu.code='HOB' and h.company_id=company) then
    raise exception 'Cobija debe tener la regla de 1 noche';
  end if;
  foreach n in array array[1,2] loop
    r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','5698444444'||n||'@s.whatsapp.net','phone','+5698444444'||n,'external_id','S'||n,'content','Reservo'));
    conv:=(r->>'conversation_id')::uuid;
    perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Confirmo','intent','booking_intent','needs_human',false,
      'extracted',jsonb_build_object('guest_name','Cliente '||n,'check_in',ci+n*5,'check_out',ci+n*5+n,'guests',2,'room_type','Mini depto','hostel_code','HOB')));
    r:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv));
    perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000009@s.whatsapp.net','phone','+56970000009','external_id','O'||n,'content','OK '||(r->>'code')));
    select * into c from public.lucia_conversations where id=conv;
    if n=1 and (c.booking_total<>32000 or c.booking_deposit<>32000) then raise exception '1 noche: se paga completa (%/%)',c.booking_deposit,c.booking_total; end if;
    if n=2 and (c.booking_total<>64000 or c.booking_deposit<>32000) then raise exception '2 noches: abono 50%% (%/%)',c.booking_deposit,c.booking_total; end if;
    if n=1 and not exists(select 1 from public.lucia_messages where conversation_id=conv and content like '%1 noche se confirman con el pago total%') then
      raise exception 'El cliente debe saber que 1 noche se paga completa';
    end if;
  end loop;
end $$;

select 'lucia single night ok' as result;
rollback;
