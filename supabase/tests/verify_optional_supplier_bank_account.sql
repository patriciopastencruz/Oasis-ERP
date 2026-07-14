\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code = 'OASIS' \gset
select id as unit_id from public.business_units where company_id = :'company_id' and code = 'OM' \gset

\set actor_id '00000000-0000-4000-8000-00000000e001'
\set category_id '00000000-0000-4000-8000-00000000e002'
\set center_id '00000000-0000-4000-8000-00000000e003'
\set supplier_without_bank '00000000-0000-4000-8000-00000000e004'
\set supplier_with_bank '00000000-0000-4000-8000-00000000e005'
\set request_without_bank '00000000-0000-4000-8000-00000000e006'
\set request_missing_bank '00000000-0000-4000-8000-00000000e007'
\set request_with_bank '00000000-0000-4000-8000-00000000e008'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values (:'actor_id','authenticated','authenticated','optional-bank@local.test','x',now(),now(),now());

insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values (:'actor_id',(select id from public.roles where key='worker'),'Prueba','Solicitante','optional-bank@local.test','Pruebas',:'actor_id');

insert into public.user_companies(user_id,company_id) values (:'actor_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id)
values (:'actor_id',:'company_id',:'unit_id');

insert into public.expense_categories(id,company_id,code,name,active,created_by)
values (:'category_id',:'company_id','TEST-OPTIONAL-BANK','Categoría de prueba',true,:'actor_id');
insert into public.cost_centers(id,company_id,code,name,active,created_by)
values (:'center_id',:'company_id','TEST-OPTIONAL-BANK','Centro de prueba',true,:'actor_id');

insert into public.suppliers(id,company_id,rut,legal_name,created_by) values
  (:'supplier_without_bank',:'company_id','78.271.136-9','Proveedor sin cuenta',:'actor_id'),
  (:'supplier_with_bank',:'company_id','76.123.456-0','Proveedor con cuenta',:'actor_id');

insert into public.supplier_bank_accounts(
  company_id,supplier_id,bank_name,account_type,account_number,
  account_holder_name,account_holder_rut,receipt_email,active,
  verification_status,verified_at,verified_by,created_by
) values (
  :'company_id',:'supplier_with_bank','Banco de Chile','checking','123456789',
  'Proveedor con cuenta','78.271.136-9','pagos@example.test',true,
  'verified',now(),:'actor_id',:'actor_id'
);

-- El seed usa fechas por defecto del servidor; la prueba fija explícitamente
-- la vigencia local para no depender del cambio de día entre UTC y Santiago.
update public.approval_workflows
set valid_from = current_date
where company_id = :'company_id' and business_unit_id = :'unit_id';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e001","role":"authenticated"}',
  true
);

insert into public.payment_requests(
  id,company_id,business_unit_id,requester_id,request_type,supplier_id,
  supplier_rut,supplier_legal_name,amount,expense_category_id,cost_center_id,
  description,priority,use_supplier_bank_account,created_by
) values (
  :'request_without_bank',:'company_id',:'unit_id',:'actor_id','supplier_payment',:'supplier_without_bank',
  '78.271.136-9','Proveedor sin cuenta',50000,:'category_id',:'center_id',
  'Pago en efectivo autorizado','normal',false,:'actor_id'
);
insert into public.payment_request_attachments(
  company_id,payment_request_id,object_path,original_name,mime_type,size_bytes,uploaded_by
) values (
  :'company_id',:'request_without_bank',:'company_id'||'/'||:'request_without_bank'||'/respaldo.pdf',
  'respaldo.pdf','application/pdf',100,:'actor_id'
);
select public.submit_payment_request(:'request_without_bank');

do $$
begin
  if not exists (
    select 1 from public.payment_requests
    where id = '00000000-0000-4000-8000-00000000e006'
      and status = 'pending_approval'
      and use_supplier_bank_account = false
      and supplier_bank_account_id is null
      and bank_name is null
      and account_number is null
  ) then
    raise exception 'La solicitud sin cuenta no fue enviada correctamente';
  end if;
end
$$;

insert into public.payment_requests(
  id,company_id,business_unit_id,requester_id,request_type,supplier_id,
  supplier_rut,supplier_legal_name,amount,expense_category_id,cost_center_id,
  description,priority,use_supplier_bank_account,created_by
) values (
  :'request_missing_bank',:'company_id',:'unit_id',:'actor_id','supplier_payment',:'supplier_without_bank',
  '78.271.136-9','Proveedor sin cuenta',50000,:'category_id',:'center_id',
  'Transferencia sin cuenta registrada','normal',true,:'actor_id'
);
insert into public.payment_request_attachments(
  company_id,payment_request_id,object_path,original_name,mime_type,size_bytes,uploaded_by
) values (
  :'company_id',:'request_missing_bank',:'company_id'||'/'||:'request_missing_bank'||'/respaldo.pdf',
  'respaldo.pdf','application/pdf',100,:'actor_id'
);
do $$
begin
  perform public.submit_payment_request('00000000-0000-4000-8000-00000000e007');
  raise exception 'Se permitió enviar una transferencia sin cuenta bancaria';
exception when others then
  if sqlerrm = 'Se permitió enviar una transferencia sin cuenta bancaria' then raise; end if;
  if sqlerrm not ilike '%cuenta bancaria disponible%' then raise; end if;
end
$$;

insert into public.payment_requests(
  id,company_id,business_unit_id,requester_id,request_type,supplier_id,
  supplier_rut,supplier_legal_name,amount,expense_category_id,cost_center_id,
  description,priority,use_supplier_bank_account,created_by
) values (
  :'request_with_bank',:'company_id',:'unit_id',:'actor_id','supplier_payment',:'supplier_with_bank',
  '76.123.456-0','Proveedor con cuenta',50000,:'category_id',:'center_id',
  'Transferencia con snapshot','normal',true,:'actor_id'
);
insert into public.payment_request_attachments(
  company_id,payment_request_id,object_path,original_name,mime_type,size_bytes,uploaded_by
) values (
  :'company_id',:'request_with_bank',:'company_id'||'/'||:'request_with_bank'||'/respaldo.pdf',
  'respaldo.pdf','application/pdf',100,:'actor_id'
);
select public.submit_payment_request(:'request_with_bank');

do $$
begin
  if not exists (
    select 1 from public.payment_requests
    where id = '00000000-0000-4000-8000-00000000e008'
      and status = 'pending_approval'
      and use_supplier_bank_account = true
      and bank_name = 'Banco de Chile'
      and account_number = '123456789'
      and supplier_bank_account_id is not null
  ) then
    raise exception 'No se congeló el snapshot de la cuenta bancaria';
  end if;
end
$$;

reset role;
do $$
begin
  update public.payment_requests
  set use_supplier_bank_account = false
  where id = '00000000-0000-4000-8000-00000000e008';
  raise exception 'Se permitió cambiar el destino después del envío';
exception when others then
  if sqlerrm = 'Se permitió cambiar el destino después del envío' then raise; end if;
  if sqlerrm not ilike '%datos financieros no pueden modificarse%' then raise; end if;
end
$$;

rollback;
\echo 'OK: solicitudes con y sin cuenta, snapshot e inmutabilidad verificados.'
