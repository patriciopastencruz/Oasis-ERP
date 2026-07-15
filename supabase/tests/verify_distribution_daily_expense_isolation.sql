\set ON_ERROR_STOP on
begin;

-- Confirma que "Gastos del día" en el cierre de Distribuidora Altiplánica
-- (dist_daily_expenses / dist_daily_summary) suma únicamente los gastos de
-- caja chica cargados a la unidad DA para esa fecha, sin mezclar gastos de
-- otras unidades de negocio, y que un reporte rechazado no cuenta mientras
-- que uno en borrador sí (comportamiento confirmado con el usuario).

select id as company_id from public.companies where code='OASIS' \gset
select id as da_unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
select id as hoc_unit_id from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set category_id '33333333-3333-4333-8333-333333333333'
\set center_id '44444444-4444-4444-8444-444444444444'
\set admin_id '00000000-0000-4000-8000-0000000e0001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'admin_id','authenticated','authenticated','isolation-admin@local.test','x',now(),now(),now());
insert into public.expense_categories(id,company_id,code,name,active,created_by)
values(:'category_id',:'company_id','TEST-ISO','Categoría aislamiento',true,:'admin_id');
insert into public.cost_centers(id,company_id,code,name,active,created_by)
values(:'center_id',:'company_id','TEST-ISO','Centro aislamiento',true,:'admin_id');
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='superadmin'),'Prueba','Aislamiento','isolation-admin@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'admin_id',:'company_id',:'da_unit_id'),(:'admin_id',:'company_id',:'hoc_unit_id');

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

-- Reporte y gasto cargados a DA, fecha objetivo, aún en borrador.
insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-0000000e0101',:'company_id',:'da_unit_id',:'admin_id','2026-08-03','2026-08-09','Rendición DA borrador',:'admin_id');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-0000000e0201',:'company_id',:'da_unit_id','00000000-0000-4000-8000-0000000e0101','2026-08-04','Comercio DA','receipt',:'category_id',:'center_id','Gasto DA borrador',20000,:'admin_id');

-- Reporte y gasto de OTRA unidad (HOC), misma fecha, no debe contarse en DA.
insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-0000000e0102',:'company_id',:'hoc_unit_id',:'admin_id','2026-08-03','2026-08-09','Rendición HOC',:'admin_id');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-0000000e0202',:'company_id',:'hoc_unit_id','00000000-0000-4000-8000-0000000e0102','2026-08-04','Comercio HOC','receipt',:'category_id',:'center_id','Gasto HOC, no debe verse en DA',99999,:'admin_id');

-- Segundo reporte de DA, misma fecha, rechazado tras revisión: no debe contarse.
insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-0000000e0103',:'company_id',:'da_unit_id',:'admin_id','2026-08-03','2026-08-09','Rendición DA rechazada',:'admin_id');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-0000000e0203',:'company_id',:'da_unit_id','00000000-0000-4000-8000-0000000e0103','2026-08-04','Comercio DA rechazado','receipt',:'category_id',:'center_id','Gasto DA rechazado, no debe verse',77777,:'admin_id');
insert into public.petty_cash_line_attachments(id,company_id,business_unit_id,petty_cash_report_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
values('00000000-0000-4000-8000-0000000e0303',:'company_id',:'da_unit_id','00000000-0000-4000-8000-0000000e0103','00000000-0000-4000-8000-0000000e0203',:'company_id'||'/00000000-0000-4000-8000-0000000e0103/00000000-0000-4000-8000-0000000e0203/a.pdf','boleta.pdf','application/pdf',100,:'admin_id');
select public.submit_petty_cash_report('00000000-0000-4000-8000-0000000e0103');
select public.decide_petty_cash_report('00000000-0000-4000-8000-0000000e0103','rejected','Rechazado para prueba de aislamiento');

do $$
declare
  expense_total numeric;
  summary jsonb;
  da_unit uuid := (select id from public.business_units where code='DA');
  hoc_unit uuid := (select id from public.business_units where code='HOC');
begin
  expense_total := public.dist_daily_expenses(da_unit, '2026-08-04'::date);
  if expense_total <> 20000 then
    raise exception 'dist_daily_expenses debía sumar solo el gasto DA (20000), dio %', expense_total;
  end if;

  summary := public.dist_daily_summary(da_unit, '2026-08-04'::date);
  if (summary->>'expense_total')::numeric <> 20000 then
    raise exception 'dist_daily_summary.expense_total debía ser 20000, dio %', summary->>'expense_total';
  end if;

  -- El gasto de HOC no debe filtrarse aunque se consulte con el mismo rango de fecha.
  if public.dist_daily_expenses(hoc_unit, '2026-08-04'::date) <> 99999 then
    raise exception 'El gasto de HOC no quedó aislado correctamente en su propia unidad';
  end if;

  raise notice 'Aislamiento de gastos por unidad en el cierre diario de DA verificado: % (excluye HOC 99999 y DA rechazado 77777)', expense_total;
end $$;

rollback;
