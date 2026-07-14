\set ON_ERROR_STOP on
create extension if not exists dblink;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set worker_id '00000000-0000-4000-8000-00000000f001'
\set category_id '11111111-1111-4111-8111-11111111f001'
\set center_id '22222222-2222-4222-8222-22222222f001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'worker_id','authenticated','authenticated','petty-concurrency@local.test','x',now(),now(),now());
insert into public.expense_categories(id,company_id,code,name,active,created_by) values(:'category_id',:'company_id','TEST-CONC','Categoría concurrencia',true,:'worker_id');
insert into public.cost_centers(id,company_id,code,name,active,created_by) values(:'center_id',:'company_id','TEST-CONC','Centro concurrencia',true,:'worker_id');
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'worker_id',(select id from public.roles where key='worker'),'Prueba','Concurrencia','petty-concurrency@local.test','Pruebas',:'worker_id');
insert into public.user_companies(user_id,company_id) values(:'worker_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'worker_id',:'company_id',:'unit_id');

insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by) values
 ('00000000-0000-4000-8000-00000000f101',:'company_id',:'unit_id',:'worker_id','2026-07-20','2026-07-26','Concurrente uno',:'worker_id'),
 ('00000000-0000-4000-8000-00000000f102',:'company_id',:'unit_id',:'worker_id','2026-07-20','2026-07-26','Concurrente dos',:'worker_id');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by) values
 ('00000000-0000-4000-8000-00000000f201',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000f101','2026-07-20','Comercio A','receipt',:'category_id',:'center_id','Concurrente A',60000,:'worker_id'),
 ('00000000-0000-4000-8000-00000000f202',:'company_id',:'unit_id','00000000-0000-4000-8000-00000000f102','2026-07-20','Comercio B','receipt',:'category_id',:'center_id','Concurrente B',60000,:'worker_id');
insert into public.petty_cash_line_attachments(company_id,business_unit_id,petty_cash_report_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by) values
 (:'company_id',:'unit_id','00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000f201',:'company_id'||'/00000000-0000-4000-8000-00000000f101/00000000-0000-4000-8000-00000000f201/a.pdf','a.pdf','application/pdf',100,:'worker_id'),
 (:'company_id',:'unit_id','00000000-0000-4000-8000-00000000f102','00000000-0000-4000-8000-00000000f202',:'company_id'||'/00000000-0000-4000-8000-00000000f102/00000000-0000-4000-8000-00000000f202/b.pdf','b.pdf','application/pdf',100,:'worker_id');

select dblink_connect('pc1','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
select dblink_connect('pc2','host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
select dblink_send_query('pc1',format(
  'select public.submit_petty_cash_report(''00000000-0000-4000-8000-00000000f101'') from (select set_config(''request.jwt.claims'',''{"sub":"%s","role":"authenticated"}'',false)) c, lateral (select pg_advisory_xact_lock(hashtextextended(''%s:%s:%s:2026-07-20'',0)),pg_sleep(1)) w',
  :'worker_id',:'worker_id',:'company_id',:'unit_id'));
select pg_sleep(0.1);
select dblink_send_query('pc2',format(
  'select public.submit_petty_cash_report(''00000000-0000-4000-8000-00000000f102'') from (select set_config(''request.jwt.claims'',''{"sub":"%s","role":"authenticated"}'',false)) c',:'worker_id'));
select * from dblink_get_result('pc1') as result(value jsonb);
select * from dblink_get_result('pc2',false) as result(value jsonb);
select dblink_disconnect('pc1'); select dblink_disconnect('pc2');

do $$
declare sent int; drafts int;
begin
  select count(*) filter(where status='submitted'),count(*) filter(where status='draft') into sent,drafts
  from public.petty_cash_reports where id in ('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000f102');
  if sent<>1 or drafts<>1 then raise exception 'La concurrencia permitió comprometer más de 100.000: enviados %, borradores %',sent,drafts; end if;
end $$;

\echo 'OK: dos envíos concurrentes de $60.000 dejaron exactamente uno enviado y uno bloqueado.'
