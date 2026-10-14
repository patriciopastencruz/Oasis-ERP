\set ON_ERROR_STOP on
begin;

-- Verifica las metas del reporte semanal: valores iniciales, solo gerencia
-- las cambia, validaciones de rango y lectura limitada a hostales asignados.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set boss '00000000-0000-4000-8000-0000000d1001'
\set admin '00000000-0000-4000-8000-0000000d1002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@goals.test','x',now(),now(),now() from unnest(array[:'boss',:'admin']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'boss',(select id from public.roles where key='general_manager'),'Gina','Gerencia',:'boss'||'@goals.test','Pruebas',:'boss'),
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@goals.test','Pruebas',:'boss');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'boss',:'admin']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'boss',:'admin']) v;

-- Metas iniciales.
do $$
declare g public.lodging_report_goals;
begin
  select * into g from public.lodging_report_goals where business_unit_id=(select id from public.business_units where code='HU');
  if g.occupancy_pct is distinct from 80 or g.average_rate is distinct from 26000 or g.booking_score is distinct from 8
     or g.booking_categories is distinct from '{"cleanliness":8,"staff":8,"wifi":7}'::jsonb then raise exception 'HU inicial: %',to_jsonb(g); end if;
  select * into g from public.lodging_report_goals where business_unit_id=(select id from public.business_units where code='HOC');
  if g.occupancy_pct is distinct from 90 or g.average_rate is distinct from 27000 or g.booking_score is distinct from 7.5 or g.revpar is distinct from 27000 then raise exception 'HOC inicial'; end if;
  select * into g from public.lodging_report_goals where business_unit_id=(select id from public.business_units where code='HOB');
  if g.occupancy_pct is distinct from 90 or g.average_rate is distinct from 30000 or g.booking_score is distinct from 7.5 or g.revpar is not null then raise exception 'HOB inicial'; end if;
end $$;

set local role authenticated;

-- ---------- Administración lee pero no cambia ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ declare failed boolean := false;
begin
  if (select count(*) from public.lodging_report_goals) is distinct from 1::bigint then raise exception 'Solo ve su hostal'; end if;
  begin perform public.lodging_set_report_goals((select id from public.business_units where code='HU'),'{"occupancy_pct":50}'); exception when others then failed := sqlerrm like '%Sin autorizacion%'; end;
  if not failed then raise exception 'Administración cambió metas'; end if;
end $$;

-- ---------- Gerencia ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'boss'),true);
do $$ declare failed boolean := false; hu uuid := (select id from public.business_units where code='HU');
begin
  perform public.lodging_set_report_goals(hu,'{"occupancy_pct":"85","average_rate":"27500","revpar":"21000","booking_score":"8.24","booking_categories":{"cleanliness":"8.5","wifi":""}}');
  if (select revpar from public.lodging_report_goals where business_unit_id=hu) is distinct from 21000 then raise exception 'RevPAR meta'; end if;
  if (select occupancy_pct from public.lodging_report_goals where business_unit_id=hu) is distinct from 85 then raise exception 'Ocupación'; end if;
  if (select booking_score from public.lodging_report_goals where business_unit_id=hu) is distinct from 8.2 then raise exception 'Puntaje redondeado'; end if;
  if (select booking_categories from public.lodging_report_goals where business_unit_id=hu) is distinct from '{"cleanliness":8.5}'::jsonb then raise exception 'Áreas: vacías se quitan'; end if;
  -- Sin meta de ADR.
  perform public.lodging_set_report_goals(hu,'{"occupancy_pct":"85","average_rate":""}');
  if (select average_rate from public.lodging_report_goals where business_unit_id=hu) is not null then raise exception 'ADR vacío'; end if;
  begin perform public.lodging_set_report_goals(hu,'{"occupancy_pct":120}'); exception when others then failed := sqlerrm like '%ocupacion%'; end;
  if not failed then raise exception 'Rango ocupación'; end if;
  failed := false;
  begin perform public.lodging_set_report_goals(hu,'{"booking_categories":{"pileta":8}}'); exception when others then failed := sqlerrm like '%Area desconocida%'; end;
  if not failed then raise exception 'Área desconocida'; end if;
  failed := false;
  begin perform public.lodging_set_report_goals((select id from public.business_units where code='HOC'),'{"occupancy_pct":70}'); exception when others then failed := sqlerrm like '%Unidad no autorizada%'; end;
  if not failed then raise exception 'Hostal no asignado'; end if;
end $$;

reset role;
do $$
begin
  if not exists(select 1 from public.audit_logs where entity_type='lodging_report_goals' and actor_id='00000000-0000-4000-8000-0000000d1001') then raise exception 'Auditoría'; end if;
end $$;

select 'lodging report goals ok' as result;
rollback;
