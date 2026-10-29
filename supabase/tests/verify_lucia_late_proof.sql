\set ON_ERROR_STOP on
begin;

-- Recordatorio 10 minutos antes de vencer el plazo y comprobante que llega
-- después de vencido: si la habitación sigue libre se vuelve a guardar y
-- sigue el flujo normal; si no, aviso al equipo con el comprobante.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set room1 '00000000-0000-4000-8000-0000000e2101'

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,room_type,capacity,base_rate,rates_by_guests,display_order)
values(:'room1',:'company_id',:'hoc','LP1','Prueba tardío 1','Modulares',2,27000,'{"1":27000,"2":32000}',990);
update public.lodging_rooms set active=false where business_unit_id=:'hoc' and id<>:'room1';
update public.lucia_hostels set manager_phone='+56970000301', admin_phones='{}', deposit_percent=50, hold_minutes=30 where business_unit_id=:'hoc';

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.hoc',:'hoc',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; conv uuid; code text; c public.lucia_conversations;
  ci date:=current_date+20; old_res uuid; path text:=company||'/2026-10/LT3.jpg';
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981250001@s.whatsapp.net','phone','+56981250001','external_id','LT1','push_name','Mati','content','Quiero reservar'));
  conv:=(r->>'conversation_id')::uuid;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Listo','intent','booking_intent','needs_human',false,
    'extracted',jsonb_build_object('guest_name','Matías Prueba','check_in',ci,'check_out',ci+1,'guests',2,'room_type','Modulares','hostel_code','HOC')));
  code:=public.lucia_request_booking(jsonb_build_object('conversation_id',conv))->>'code';
  perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56970000301@s.whatsapp.net','phone','+56970000301','external_id','LT2','content','ok '||code));
  if (select booking_status from public.lucia_conversations where id=conv)<>'awaiting_payment' then raise exception 'Recepción debía confirmar'; end if;

  -- Faltan 8 minutos: un solo recordatorio.
  update public.lucia_conversations set hold_expires_at=now()+interval '8 minutes' where id=conv;
  perform public.lucia_expire_holds(company);
  perform public.lucia_expire_holds(company);
  if (select count(*) from public.lucia_messages where conversation_id=conv and content like '⏳ Te quedan 8 minutos%') <> 1 then
    raise exception 'Debe recordar una sola vez antes de vencer: %',
      (select string_agg(left(content,60),' | ') from public.lucia_messages where conversation_id=conv and content like '⏳%');
  end if;

  -- Vence.
  update public.lucia_conversations set hold_expires_at=now()-interval '1 minute' where id=conv;
  perform public.lucia_expire_holds(company);
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_status<>'expired' then raise exception 'Debía vencer'; end if;
  old_res:=c.reservation_id;

  -- Comprobante tardío con la habitación libre: se vuelve a guardar.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981250001@s.whatsapp.net','phone','+56981250001','external_id','LT3',
    'message_type','image','media_path',path));
  if r->>'status'<>'payment_proof' then raise exception 'El comprobante tardío debe tomarse como comprobante: %', r; end if;
  select * into c from public.lucia_conversations where id=conv;
  if c.booking_status<>'proof_received' or c.reservation_id=old_res then raise exception 'Debe reactivar la reserva: %', row_to_json(c); end if;
  if (select status from public.lodging_reservations where id=c.reservation_id)<>'pending'
     or (select status from public.lodging_reservations where id=old_res)<>'cancelled' then
    raise exception 'La reserva nueva queda pendiente y la vencida sigue anulada';
  end if;
  if not exists(select 1 from public.lucia_staff_messages where conversation_id=conv and content like '💸%' and media_path=path) then
    raise exception 'El equipo recibe el comprobante';
  end if;

  -- Segundo cliente: comprobante tardío pero la habitación ya se ocupó.
  update public.lodging_reservations set status='cancelled' where id=c.reservation_id;
  update public.lucia_conversations set booking_status='expired', hold_expires_at=now()-interval '2 hours' where id=conv;
  insert into public.lodging_guests(company_id,business_unit_id,full_name,phone) values(company,current_setting('lucia.hoc')::uuid,'Otro','+56900000000');
  insert into public.lodging_reservations(company_id,business_unit_id,room_id,guest_id,origin,status,check_in,check_out,guest_count,nightly_rate,total_value)
  select company,current_setting('lucia.hoc')::uuid,'00000000-0000-4000-8000-0000000e2101',(select id from public.lodging_guests where full_name='Otro' limit 1),'whatsapp','confirmed',ci,ci+1,1,27000,27000;
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981250001@s.whatsapp.net','phone','+56981250001','external_id','LT4',
    'message_type','image','media_path',path));
  if r->>'status'<>'late_payment_proof' then raise exception 'Sin habitación libre: aviso de comprobante tardío: %', r; end if;
  if not exists(select 1 from public.lucia_staff_messages where conversation_id=conv and content like '💸⚠️%DESPUÉS de vencer%' and media_path=path) then
    raise exception 'Debe avisar al equipo con el comprobante';
  end if;
  if exists(select 1 from public.lucia_staff_messages where conversation_id=conv and content like '🔔 Lucía necesita ayuda%') then
    raise exception 'No se duplica con el aviso genérico';
  end if;
end $$;

rollback;
