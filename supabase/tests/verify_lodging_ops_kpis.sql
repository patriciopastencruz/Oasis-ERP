\set ON_ERROR_STOP on
begin;

-- Verifica los indicadores ejecutivos de la operación: tiempos de aseo por
-- habitación y persona, retrabajos, aprobadas a la primera, espera de
-- inspección y rechazos por motivo; solo gerencia/administración y solo sus
-- hostales.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set admin '00000000-0000-4000-8000-0000000c7001'
\set maid '00000000-0000-4000-8000-0000000c7002'
\set clerk '00000000-0000-4000-8000-0000000c7003'
\set r1 '00000000-0000-4000-8000-0000000c8001'
\set r2 '00000000-0000-4000-8000-0000000c8002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@kpi.test','x',now(),now(),now() from unnest(array[:'admin',:'maid',:'clerk']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@kpi.test','Pruebas',:'admin'),
 (:'maid',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid'||'@kpi.test','Pruebas',:'admin'),
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@kpi.test','Pruebas',:'admin');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'admin',:'maid',:'clerk']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'admin',:'maid',:'clerk']) v;

-- Aislamiento: las tareas de la prueba ocurren el 15-01-2020 (sin otra actividad).

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order) values
 (:'r1',:'company_id',:'hu','KP1','KPI 1',1),(:'r2',:'company_id',:'hu','KP2','KPI 2',2);

-- 15-01-2020 a las 15:00: KPI 1 limpiada en 30 min (rechazada) y retrabajo en 20 min (aprobada);
-- KPI 2 limpiada en 40 min, aprobada a la primera 60 min después.
insert into public.lodging_housekeeping_tasks(id,company_id,business_unit_id,room_id,origin,status,attempt,started_by,started_at,completed_by,completed_at,duration_minutes,checklist) values
 ('00000000-0000-4000-8000-0000000c9001',:'company_id',:'hu',:'r1','checkout','completed',1,:'maid',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '3 hours',:'maid',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '150 minutes',30,'{}'),
 ('00000000-0000-4000-8000-0000000c9002',:'company_id',:'hu',:'r1','rework','completed',2,:'maid',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '100 minutes',:'maid',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '80 minutes',20,'{}'),
 ('00000000-0000-4000-8000-0000000c9003',:'company_id',:'hu',:'r2','checkout','completed',1,:'maid',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '140 minutes',:'maid',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '100 minutes',40,'{}');
insert into public.lodging_room_inspections(company_id,business_unit_id,room_id,task_id,result,rejection_reason,inspector_id,inspected_at,checklist) values
 (:'company_id',:'hu',:'r1','00000000-0000-4000-8000-0000000c9001','rejected','Baño mal limpiado',:'clerk',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '140 minutes','{}'),
 (:'company_id',:'hu',:'r1','00000000-0000-4000-8000-0000000c9002','approved',null,:'clerk',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '70 minutes','{}'),
 (:'company_id',:'hu',:'r2','00000000-0000-4000-8000-0000000c9003','approved',null,:'clerk',(timestamp '2020-01-15 15:00' at time zone 'America/Santiago')-interval '40 minutes','{}');

create temp table ctx as select date '2020-01-15' d;
grant select on ctx to authenticated;
set local role authenticated;

-- ---------- Recepción no ve los indicadores del personal ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_ops_kpis((select id from public.business_units where code='HU'),(select d from ctx),(select d from ctx)); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción vio los indicadores'; end if;
end $$;

-- ---------- Administración ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ declare k jsonb; room jsonb; person jsonb; failed boolean := false; d date := (select d from ctx);
begin
  k := public.lodging_ops_kpis((select id from public.business_units where code='HU'),d,d);
  if (k->'totals'->>'cleanings')::int is distinct from 3 then raise exception 'Limpiezas: %',k->'totals'; end if;
  if (k->'totals'->>'avg_minutes')::int is distinct from 30 then raise exception 'Promedio: %',k->'totals'; end if;
  if (k->'totals'->>'max_minutes')::int is distinct from 40 then raise exception 'Máximo'; end if;
  if (k->'totals'->>'rework')::int is distinct from 1 then raise exception 'Retrabajos'; end if;
  -- Aprobadas a la primera: 1 de 2 primeras limpiezas inspeccionadas.
  if (k->'totals'->>'approved_first')::int is distinct from 1 or (k->'totals'->>'first_attempt')::int is distinct from 2 then raise exception 'A la primera: %',k->'totals'; end if;
  -- Espera de inspección: 10, 10 y 60 minutos → 27.
  if (k->'totals'->>'avg_wait_minutes')::int is distinct from 27 then raise exception 'Espera: %',k->'totals'; end if;
  if (k->'inspections'->>'rejected')::int is distinct from 1 then raise exception 'Rechazos'; end if;
  if k->'rejection_reasons'->0->>'reason' is distinct from 'Baño mal limpiado' then raise exception 'Motivos'; end if;
  select e into room from jsonb_array_elements(k->'by_room') e where e->>'name'='KPI 1';
  if (room->>'cleanings')::int is distinct from 2 or (room->>'avg_minutes')::int is distinct from 25 or (room->>'rejected')::int is distinct from 1 or (room->>'last_minutes')::int is distinct from 20 then raise exception 'Por habitación: %',room; end if;
  select e into person from jsonb_array_elements(k->'by_person') e where e->>'name'='María Aseo';
  if (person->>'cleanings')::int is distinct from 3 or (person->>'rejected')::int is distinct from 1 then raise exception 'Por persona: %',person; end if;
  if (select (e->>'inspections')::int from jsonb_array_elements(k->'by_inspector') e where e->>'name'='Carla Recepción') is distinct from 3 then raise exception 'Por inspector'; end if;
  -- Sin acceso a otro hostal, y período válido.
  begin perform public.lodging_ops_kpis((select id from public.business_units where code='HOC'),d,d); exception when others then failed := true; end;
  if not failed then raise exception 'Vio un hostal no asignado'; end if;
  failed := false;
  begin perform public.lodging_ops_kpis((select id from public.business_units where code='HU'),d,d-1); exception when others then failed := sqlerrm like '%Periodo%'; end;
  if not failed then raise exception 'Período inválido'; end if;
end $$;

select 'lodging ops kpis ok' as result;
rollback;
