\set ON_ERROR_STOP on
begin;

-- Verifica la separación del cierre mensual: administración prepara el mes
-- (inicia, carga líneas, categorías) sin ver el informe completo; gerencia ve
-- el informe y cierra o reabre. El rol "Supervisor de hostales" queda inactivo
-- porque supervisor y administrador son un mismo cargo.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin '00000000-0000-4000-8000-0000000f0001'
\set gm '00000000-0000-4000-8000-0000000f0002'
\set boss '00000000-0000-4000-8000-0000000f0003'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@roles.test','x',now(),now(),now() from unnest(array[:'admin',:'gm',:'boss']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Administradora',:'admin'||'@roles.test','Pruebas',:'admin'),
 (:'gm',(select id from public.roles where key='general_manager'),'Gonzalo','Gerente',:'gm'||'@roles.test','Pruebas',:'admin'),
 (:'boss',(select id from public.roles where key='superadmin'),'Sara','Super',:'boss'||'@roles.test','Pruebas',:'admin');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'admin',:'gm',:'boss']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'admin',:'gm',:'boss']) v;

delete from public.lodging_monthly_closing_lines where business_unit_id=:'hu';
delete from public.lodging_monthly_closings where business_unit_id=:'hu';

-- Permisos por rol.
do $$
declare has boolean;
begin
  if exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
    where r.key='administrator' and p.key='lodging.monthly_closing.view') then raise exception 'Administración no debe ver el informe completo'; end if;
  select count(*)=2 into has from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
    where r.key='administrator' and p.key in('lodging.monthly_closing.manage','lodging.audits.execute');
  if not has then raise exception 'Administración prepara el mes y audita (cargo supervisor)'; end if;
  if (select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
    where p.key='lodging.monthly_closing.close' and r.key in('superadmin','general_manager')) is distinct from 2::bigint then raise exception 'Gerencia cierra el mes'; end if;
  -- Se desactiva solo si nadie lo usa (en producción no tiene usuarios activos).
  if (select active from public.roles where key='lodging_supervisor')
     and not exists(select 1 from public.profiles pr join public.roles r on r.id=pr.role_id where r.key='lodging_supervisor' and pr.active and pr.deleted_at is null)
  then raise exception 'Supervisor de hostales debe quedar inactivo'; end if;
end $$;

create temp table ctx as select date_trunc('month',(now() at time zone 'America/Santiago'))::date as m;
grant select on ctx to authenticated;
set local role authenticated;

-- ---------- Administración: prepara sin ver el informe ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); m date := (select m from ctx); c uuid; cat uuid; prep jsonb; failed boolean := false;
begin
  c := public.lodging_monthly_start(hu,m);
  select (e->>'id')::uuid into cat from jsonb_array_elements(public.lodging_monthly_preparation(hu,m)->'categories') e where e->>'section'='fixed' and (e->>'active')::boolean limit 1;
  if cat is null then raise exception 'Categorías visibles al preparar'; end if;
  perform public.lodging_monthly_save_line(c,jsonb_build_object('category_id',cat,'description','Arriendo','amount',500000,'payer','oasis','payment_status','pendiente'));
  prep := public.lodging_monthly_preparation(hu,m);
  if prep->'closing'->>'status' is distinct from 'draft' then raise exception 'Estado del mes: %',prep; end if;
  if not exists(select 1 from jsonb_array_elements(prep->'lines') e where e->>'description'='Arriendo' and (e->>'amount')::numeric=500000) then raise exception 'Línea cargada: %',prep; end if;
  if prep ? 'totals' or prep ? 'income' or prep::text like '%profit%' then raise exception 'La preparación no debe traer totales ni utilidad'; end if;
  if (prep->'daily_closings'->>'days')::int < 1 then raise exception 'Control de cierres diarios'; end if;
  begin perform public.lodging_monthly_summary(hu,m); exception when others then failed := true; end;
  if not failed then raise exception 'Administración vio el informe completo'; end if;
  failed := false;
  begin perform public.lodging_monthly_close(c,null); exception when others then failed := true; end;
  if not failed then raise exception 'Administración no cierra el mes'; end if;
  if exists(select 1 from public.lodging_monthly_closings) then raise exception 'Administración no lee los totales del cierre (RLS)'; end if;
end $$;

-- ---------- Gerencia general: ve y cierra, no carga líneas ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'gm'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); m date := (select m from ctx); c uuid; failed boolean := false;
begin
  if public.lodging_monthly_summary(hu,m) is null then raise exception 'Gerencia ve el informe'; end if;
  select id into c from public.lodging_monthly_closings where business_unit_id=hu and period=m;
  if c is null then raise exception 'Gerencia lee el cierre'; end if;
  begin perform public.lodging_monthly_preparation(hu,m); exception when others then failed := true; end;
  if not failed then raise exception 'Gerencia no prepara (sin permiso de carga)'; end if;
  perform public.lodging_monthly_close(c,'Revisado por gerencia');
  if (select status from public.lodging_monthly_closings where id=c) is distinct from 'closed' then raise exception 'Gerencia cierra el mes'; end if;
  perform public.lodging_monthly_reopen(c,'Ajuste');
end $$;

-- ---------- Administración con el mes cerrado: no modifica ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'boss'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); m date := (select m from ctx);
begin
  perform public.lodging_monthly_close((select id from public.lodging_monthly_closings where business_unit_id=hu and period=m),null);
end $$;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); m date := (select m from ctx); c uuid; cat uuid; failed boolean := false;
begin
  c := ((public.lodging_monthly_preparation(hu,m)->'closing'->>'id'))::uuid;
  if (public.lodging_monthly_preparation(hu,m)->'closing'->>'status') is distinct from 'closed' then raise exception 'Ve que el mes está cerrado'; end if;
  select (e->>'id')::uuid into cat from jsonb_array_elements(public.lodging_monthly_preparation(hu,m)->'categories') e where (e->>'active')::boolean limit 1;
  begin perform public.lodging_monthly_save_line(c,jsonb_build_object('category_id',cat,'description','Tarde','amount',1)); exception when others then failed := sqlerrm like '%ya esta cerrado%'; end;
  if not failed then raise exception 'No se modifica un mes cerrado'; end if;
end $$;

select 'lodging monthly roles ok' as result;
rollback;
