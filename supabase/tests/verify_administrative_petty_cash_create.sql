\set ON_ERROR_STOP on
begin;

-- Confirma que el rol Administrativo puede ingresar y ver sus propios gastos
-- de Caja Chica, pero sigue sin poder revisar/aprobar rendiciones ni ver las
-- de otro responsable (el alcance queda igual que el rol Trabajador).

select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set category_id '55555555-5555-4555-8555-555555555555'
\set center_id '66666666-6666-4666-8666-666666666666'
\set admin_id '00000000-0000-4000-8000-0000000f0001'
\set other_id '00000000-0000-4000-8000-0000000f0002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'admin_id','authenticated','authenticated','administrative-pc@local.test','x',now(),now(),now()),
 (:'other_id','authenticated','authenticated','administrative-pc-other@local.test','x',now(),now(),now());
insert into public.expense_categories(id,company_id,code,name,active,created_by) values(:'category_id',:'company_id','TEST-ADM','Categoría administrativo',true,:'admin_id');
insert into public.cost_centers(id,company_id,code,name,active,created_by) values(:'center_id',:'company_id','TEST-ADM','Centro administrativo',true,:'admin_id');
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='administrative'),'Prueba','Administrativo','administrative-pc@local.test','Administrativo',:'admin_id'),
 (:'other_id',(select id from public.roles where key='administrative'),'Otra','Persona','administrative-pc-other@local.test','Administrativo',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'other_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'other_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

-- Puede crear su propia rendición y una línea de gasto.
insert into public.petty_cash_reports(id,company_id,business_unit_id,responsible_id,week_start,week_end,general_reason,created_by)
values('00000000-0000-4000-8000-0000000f0101',:'company_id',:'unit_id',:'admin_id','2026-08-03','2026-08-09','Rendición Administrativo',:'admin_id');
insert into public.petty_cash_expense_lines(id,company_id,business_unit_id,petty_cash_report_id,expense_date,merchant_name,document_type,expense_category_id,cost_center_id,description,amount,created_by)
values('00000000-0000-4000-8000-0000000f0201',:'company_id',:'unit_id','00000000-0000-4000-8000-0000000f0101','2026-08-04','Comercio Administrativo','receipt',:'category_id',:'center_id','Gasto de prueba',15000,:'admin_id');

-- Puede ver su propia rendición.
do $$ begin
  if not exists(select 1 from public.petty_cash_reports where id='00000000-0000-4000-8000-0000000f0101') then
    raise exception 'El Administrativo no pudo ver su propia rendición recién creada';
  end if;
end $$;

-- No puede revisar/aprobar (decide_petty_cash_report exige finance.petty_cash.review).
insert into public.petty_cash_line_attachments(id,company_id,business_unit_id,petty_cash_report_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
values('00000000-0000-4000-8000-0000000f0301',:'company_id',:'unit_id','00000000-0000-4000-8000-0000000f0101','00000000-0000-4000-8000-0000000f0201',:'company_id'||'/00000000-0000-4000-8000-0000000f0101/00000000-0000-4000-8000-0000000f0201/a.pdf','boleta.pdf','application/pdf',100,:'admin_id');
select public.submit_petty_cash_report('00000000-0000-4000-8000-0000000f0101');
do $$ begin
  begin
    perform public.decide_petty_cash_report('00000000-0000-4000-8000-0000000f0101','approved','Aprobado indebidamente');
    raise exception 'El Administrativo pudo aprobar su propia rendición sin permiso de revisión';
  exception when others then
    if sqlerrm='El Administrativo pudo aprobar su propia rendición sin permiso de revisión' then raise; end if;
  end;
end $$;

-- Segunda persona con rol Administrativo: no debe ver la rendición ajena
-- (view_own solo alcanza a lo propio, sin view_unit).
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'other_id'),true);
do $$ begin
  if exists(select 1 from public.petty_cash_reports where id='00000000-0000-4000-8000-0000000f0101') then
    raise exception 'Un Administrativo pudo ver la rendición de otro responsable';
  end if;
end $$;

do $$ begin
  raise notice 'Permisos de Caja Chica para el rol Administrativo verificados: crea y ve lo propio, no revisa ni ve lo ajeno.';
end $$;

rollback;
