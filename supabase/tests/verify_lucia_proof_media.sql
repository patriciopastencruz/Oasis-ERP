\set ON_ERROR_STOP on
begin;

-- El aviso de comprobante recibido lleva el archivo del cliente: el mensaje
-- del cliente guarda la ruta y cada encargado/administrador recibe el aviso
-- como imagen (o documento) con el texto como descripción.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset

update public.lucia_hostels set manager_phone=null, admin_phones='{}';
update public.lucia_hostels set manager_phone='+56970000201', admin_phones=array['+56970000202'] where business_unit_id=:'hoc';
update public.lucia_settings set connection_status='connected', max_messages_per_minute=30 where company_id=:'company_id';

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.hoc',:'hoc',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; hoc uuid:=current_setting('lucia.hoc')::uuid;
  r jsonb; a uuid; b uuid; job jsonb; path text:=company||'/2026-10/PM2.jpg';
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981240001@s.whatsapp.net','phone','+56981240001','external_id','PM1','push_name','Ana','content','Hola'));
  a:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set business_unit_id=hoc, hostel_assigned=true, booking_status='awaiting_payment',
    check_in=current_date+1, check_out=current_date+2, guests=2, booking_total=40000, booking_deposit=20000 where id=a;
  update public.lucia_messages set delivery_status='sent' where conversation_id=a;

  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981240001@s.whatsapp.net','phone','+56981240001','external_id','PM2',
    'message_type','image','content',null,'media_path',path,'media_name',null));
  if r->>'status'<>'payment_proof' then raise exception 'Debe registrar el comprobante: %', r; end if;
  if (select media_path from public.lucia_messages where external_id='PM2')<>path then
    raise exception 'El mensaje del cliente debe guardar la ruta del comprobante';
  end if;
  if (select count(*) from public.lucia_staff_messages where conversation_id=a and content like '💸%'
        and media_path=path and media_kind='image') <> 2 then
    raise exception 'El encargado y el administrador deben recibir el aviso con la imagen';
  end if;
  if exists(select 1 from public.lucia_staff_messages where conversation_id=a and content like '🔔%') then
    raise exception 'El comprobante no repite el aviso genérico de revisión';
  end if;

  job:=public.lucia_claim_outbound(company);
  if job->>'kind'<>'staff' or job->>'message_type'<>'image' or job->>'media_path'<>path or job->>'content' not like '💸%' then
    raise exception 'El worker debe recibir el aviso como imagen con descripción: %', job;
  end if;

  -- Una ruta de otra empresa no se adjunta: el aviso va solo con texto.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981240002@s.whatsapp.net','phone','+56981240002','external_id','PM3','push_name','Beto','content','Hola'));
  b:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set business_unit_id=hoc, hostel_assigned=true, booking_status='awaiting_payment',
    check_in=current_date+1, check_out=current_date+2, guests=1, booking_total=30000, booking_deposit=15000 where id=b;
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981240002@s.whatsapp.net','phone','+56981240002','external_id','PM4',
    'message_type','document','content','pago.pdf','media_path','00000000-0000-0000-0000-000000000000/x.pdf','media_name','pago.pdf'));
  if (select media_path from public.lucia_messages where external_id='PM4') is not null then
    raise exception 'No se guarda una ruta ajena';
  end if;
  if (select count(*) from public.lucia_staff_messages where conversation_id=b and content like '💸%' and media_path is null) <> 2 then
    raise exception 'Sin archivo válido el aviso va solo con texto';
  end if;
end $$;

rollback;
