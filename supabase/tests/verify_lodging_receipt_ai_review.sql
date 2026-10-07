\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set actor '00000000-0000-4000-8000-0000000c1001'
\set room '00000000-0000-4000-8000-0000000c1002'
\set reservation '00000000-0000-4000-8000-0000000c1003'
\set payment '00000000-0000-4000-8000-0000000c1004'
\set receipt '00000000-0000-4000-8000-0000000c1005'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'actor','authenticated','authenticated','receipt-ai@test.local','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'actor',(select id from public.roles where key='administrator'),'Prueba','IA','receipt-ai@test.local','Pruebas',:'actor');
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order)
values(:'room',:'company_id',:'unit_id','AI-TEST','Habitación IA',999);
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value,created_by)
values(:'reservation',:'company_id',:'unit_id',:'room','direct','confirmed',current_date+30,current_date+31,50000,50000,:'actor');
insert into public.lodging_reservation_payments(id,company_id,business_unit_id,reservation_id,type,payment_method,amount,registered_by)
values(:'payment',:'company_id',:'unit_id',:'reservation','total','transfer',50000,:'actor');
insert into public.lodging_payment_receipts(
  id,company_id,business_unit_id,payment_id,original_name,internal_name,private_path,mime_type,size_bytes,uploaded_by,
  ai_review_status,ai_detected_amount,ai_confidence,ai_model,ai_reviewed_at
)
values(
  :'receipt',:'company_id',:'unit_id',:'payment','comprobante.png','interno.png','test/receipt-ai.png','image/png',100,:'actor',
  'matched',50000,0.98,'test-model',now()
);

do $$
declare failed boolean := false;
begin
  if (select ai_review_status from public.lodging_payment_receipts where id='00000000-0000-4000-8000-0000000c1005') is distinct from 'matched' then
    raise exception 'No se guardó el resultado IA';
  end if;
  begin
    update public.lodging_payment_receipts set ai_confidence=1.2 where id='00000000-0000-4000-8000-0000000c1005';
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'Se aceptó confianza fuera de rango'; end if;

  failed := false;
  begin
    update public.lodging_payment_receipts set ai_review_status='approved' where id='00000000-0000-4000-8000-0000000c1005';
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'Se aceptó un estado que podría aprobar pagos'; end if;
end $$;

select 'lodging receipt ai review ok' as result;
rollback;
