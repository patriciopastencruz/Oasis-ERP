\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set category_id '11111111-1111-4111-8111-111111111111'
\set center_id '22222222-2222-4222-8222-222222222222'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('00000000-0000-4000-8000-00000000a001','authenticated','authenticated','petty-worker@local.test','x',now(),now(),now()),
 ('00000000-0000-4000-8000-00000000a002','authenticated','authenticated','petty-admin@local.test','x',now(),now(),now()),
 ('00000000-0000-4000-8000-00000000a003','authenticated','authenticated','petty-outsider@local.test','x',now(),now(),now());
insert into public.expense_categories(id,company_id,code,name,active,created_by) values(:'category_id',:'company_id','TEST-PC','Categoría local',true,'00000000-0000-4000-8000-00000000a001');
insert into public.cost_centers(id,company_id,code,name,active,created_by) values(:'center_id',:'company_id','TEST-PC','Centro local',true,'00000000-0000-4000-8000-00000000a001');
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 ('00000000-0000-4000-8000-00000000a001',(select id from public.roles where key='worker'),'Prueba','Trabajador','petty-worker@local.test','Pruebas','00000000-0000-4000-8000-00000000a001'),
 ('00000000-0000-4000-8000-00000000a002',(select id from public.roles where key='administrator'),'Prueba','Administrador','petty-admin@local.test','Pruebas','00000000-0000-4000-8000-00000000a002'),
 ('00000000-0000-4000-8000-00000000a003',(select id from public.roles where key='worker'),'Otra','Persona','petty-outsider@local.test','Pruebas','00000000-0000-4000-8000-00000000a003');
insert into public.user_companies(user_id,company_id) values
 ('00000000-0000-4000-8000-00000000a001',:'company_id'),('00000000-0000-4000-8000-00000000a002',:'company_id'),('00000000-0000-4000-8000-00000000a003',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 ('00000000-0000-4000-8000-00000000a001',:'company_id',:'unit_id'),('00000000-0000-4000-8000-00000000a002',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}',true);

insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-00000000b001',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000a001','2026-07-13','2026-07-19','Primera rendición','00000000-0000-4000-8000-00000000a001');
do $$ begin
  update public.petty_cash_reports set status='approved' where id='00000000-0000-4000-8000-00000000b001';
  raise exception 'El trabajador pudo modificar el estado directamente';
exception when insufficient_privilege then null; end $$;
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-00000000c001',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000b001','2026-07-14','Comercio Uno','receipt',:'category_id',:'center_id','Gasto uno',35000,'00000000-0000-4000-8000-00000000a001');
insert into public.petty_cash_line_attachments(id,company_id,business_unit_id,petty_cash_report_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
values('00000000-0000-4000-8000-00000000d001',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000c001',:'company_id'||'/00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000c001/a.pdf','boleta.pdf','application/pdf',100,'00000000-0000-4000-8000-00000000a001');
select public.submit_petty_cash_report('00000000-0000-4000-8000-00000000b001');

insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-00000000b002',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000a001','2026-07-13','2026-07-19','Segunda rendición','00000000-0000-4000-8000-00000000a001');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-00000000c002',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000b002','2026-07-15','Comercio Dos','invoice',:'category_id',:'center_id','Gasto dos',65000,'00000000-0000-4000-8000-00000000a001');
insert into public.petty_cash_line_attachments(id,company_id,business_unit_id,petty_cash_report_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
values('00000000-0000-4000-8000-00000000d002',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000c002',:'company_id'||'/00000000-0000-4000-8000-00000000b002/00000000-0000-4000-8000-00000000c002/b.jpg','factura.jpg','image/jpeg',100,'00000000-0000-4000-8000-00000000a001');
select public.submit_petty_cash_report('00000000-0000-4000-8000-00000000b002');

do $$ begin
  if (select sum(total_registered) from public.petty_cash_reports where responsible_id=auth.uid() and status in ('submitted','resubmitted','approved'))<>100000 then
    raise exception 'El acumulado exacto de 100.000 no fue aceptado';
  end if;
end $$;

insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-00000000b003',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000a001','2026-07-13','2026-07-19','Tercera rendición','00000000-0000-4000-8000-00000000a001');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-00000000c003',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000b003','2026-07-16','Comercio Tres','voucher',:'category_id',:'center_id','Gasto tres',1,'00000000-0000-4000-8000-00000000a001');
insert into public.petty_cash_line_attachments(id,company_id,business_unit_id,petty_cash_report_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
values('00000000-0000-4000-8000-00000000d003',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000b003','00000000-0000-4000-8000-00000000c003',:'company_id'||'/00000000-0000-4000-8000-00000000b003/00000000-0000-4000-8000-00000000c003/c.png','recibo.png','image/png',100,'00000000-0000-4000-8000-00000000a001');
do $$ begin
  perform public.submit_petty_cash_report('00000000-0000-4000-8000-00000000b003');
  raise exception 'Se permitió superar el límite semanal';
exception when others then
  if sqlerrm='Se permitió superar el límite semanal' then raise; end if;
  if sqlerrm not ilike '%límite%' then raise; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}',true);
select public.decide_petty_cash_report('00000000-0000-4000-8000-00000000b002','rejected','Documento inválido','{}');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}',true);
select public.submit_petty_cash_report('00000000-0000-4000-8000-00000000b003');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}',true);
select public.decide_petty_cash_report('00000000-0000-4000-8000-00000000b001','correction_requested','Corrige el monto',array['00000000-0000-4000-8000-00000000c001'::uuid]);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}',true);
update public.petty_cash_expense_lines set amount=34000 where id='00000000-0000-4000-8000-00000000c001';
select public.submit_petty_cash_report('00000000-0000-4000-8000-00000000b001');
do $$ begin if (select revision_number from public.petty_cash_reports where id='00000000-0000-4000-8000-00000000b001')<>2 then raise exception 'El reenvío no incrementó la revisión'; end if; end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}',true);
select public.decide_petty_cash_report('00000000-0000-4000-8000-00000000b001','approved',null,'{}');
do $$ begin
  if (select status from public.petty_cash_reports where id='00000000-0000-4000-8000-00000000b001')<>'approved' then raise exception 'La aprobación no cambió el estado'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a003","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.petty_cash_reports)<>0 then raise exception 'RLS permitió ver rendiciones de una unidad no asignada'; end if; end $$;

reset role;
do $$ begin
  if not exists(select 1 from public.audit_logs where entity_type='petty_cash_reports' and entity_id='00000000-0000-4000-8000-00000000b001') then raise exception 'No se registró auditoría'; end if;
  if not exists(select 1 from public.notifications where entity_type='petty_cash_report') then raise exception 'No se generaron notificaciones'; end if;
  if exists(select 1 from public.petty_cash_reports where status='draft' and report_number is not null) then raise exception 'Un borrador recibió correlativo'; end if;
end $$;

rollback;
\echo 'OK: Caja Chica semanal, límite, corrección, aprobación, RLS, auditoría y notificaciones verificados.'
