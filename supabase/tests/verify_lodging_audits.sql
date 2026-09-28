\set ON_ERROR_STOP on
begin;

-- Verifica la auditoría semanal del supervisor (fase G): meta con mínimo y
-- tope, candidatas (inspeccionadas, no ocupadas, no auditadas en la semana),
-- ponderación por riesgo con azar, aprobada/fallida con sus acciones,
-- permisos, RLS, multiunidad, cumplimiento, KPIs del mes e histórico.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set sup '00000000-0000-4000-8000-0000000d0001'
\set sup2 '00000000-0000-4000-8000-0000000d0002'
\set maid '00000000-0000-4000-8000-0000000d0003'
\set clerk '00000000-0000-4000-8000-0000000d0004'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@audit.test','x',now(),now(),now() from unnest(array[:'sup',:'sup2',:'maid',:'clerk']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'sup',(select id from public.roles where key='lodging_supervisor'),'Sonia','Supervisora',:'sup'||'@audit.test','Pruebas',:'sup'),
 (:'sup2',(select id from public.roles where key='lodging_supervisor'),'Otro','Supervisor',:'sup2'||'@audit.test','Pruebas',:'sup'),
 (:'maid',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid'||'@audit.test','Pruebas',:'sup'),
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@audit.test','Pruebas',:'sup');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'sup',:'sup2',:'maid',:'clerk']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'sup',:'company_id',:'hu'),(:'sup',:'company_id',:'hoc'),(:'sup2',:'company_id',:'hoc'),
 (:'maid',:'company_id',:'hu'),(:'clerk',:'company_id',:'hu');

-- Aislamiento: habitaciones propias en HU y HOC.
update public.lodging_incidents set audit_id=null where business_unit_id in(:'hu',:'hoc');
delete from public.lodging_supervisor_audits where business_unit_id in(:'hu',:'hoc');
update public.lodging_rooms set active=false where business_unit_id in(:'hu',:'hoc');
update public.lodging_reservations set status='cancelled' where business_unit_id in(:'hu',:'hoc') and status not in('cancelled','conflict');
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order,operational_status)
select ('00000000-0000-4000-8000-0000000d10'||lpad(n::text,2,'0'))::uuid,:'company_id'::uuid,:'hu'::uuid,'AU'||n,'Aud '||n,n,
 case when n=6 then 'dirty' else 'inspected' end from generate_series(1,6) n;
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order)
select ('00000000-0000-4000-8000-0000000d20'||lpad(n::text,2,'0'))::uuid,:'company_id'::uuid,:'hoc'::uuid,'AC'||n,'Cen '||n,n from generate_series(1,2) n;

-- Limpiezas terminadas esta semana e inspecciones aprobadas (HU: 6 limpiezas en 5 habitaciones; HOC: 2).
create temp table seedtasks(room uuid, id uuid default gen_random_uuid(), attempt int default 1);
insert into seedtasks(room,attempt) select ('00000000-0000-4000-8000-0000000d10'||lpad(n::text,2,'0'))::uuid,1 from generate_series(1,5) n;
insert into seedtasks(room,attempt) values('00000000-0000-4000-8000-0000000d1002',2);
insert into seedtasks(room) select ('00000000-0000-4000-8000-0000000d20'||lpad(n::text,2,'0'))::uuid from generate_series(1,2) n;
insert into public.lodging_housekeeping_tasks(id,company_id,business_unit_id,room_id,origin,status,attempt,started_by,started_at,completed_by,completed_at,duration_minutes,checklist)
select s.id,:'company_id',r.business_unit_id,s.room,'checkout','completed',s.attempt,:'maid',
 greatest(now()-interval '2 hours',public.lodging_week_start((now() at time zone 'America/Santiago')::date)::timestamp at time zone 'America/Santiago'+interval '1 minute'),
 :'maid',greatest(now()-interval '1 hour',public.lodging_week_start((now() at time zone 'America/Santiago')::date)::timestamp at time zone 'America/Santiago'+interval '30 minutes')+(s.attempt*interval '1 minute'),25,'{"cama":true}'
from seedtasks s join public.lodging_rooms r on r.id=s.room;
insert into public.lodging_room_inspections(company_id,business_unit_id,room_id,task_id,result,checklist,rejection_reason,inspector_id,inspected_at)
select :'company_id',r.business_unit_id,s.room,s.id,case when s.attempt=1 and s.room='00000000-0000-4000-8000-0000000d1002' then 'rejected' else 'approved' end,'{}',
 case when s.attempt=1 and s.room='00000000-0000-4000-8000-0000000d1002' then 'Baño mal limpiado' end,:'clerk',now()
from seedtasks s join public.lodging_rooms r on r.id=s.room;
-- Aud 5 ocupada por un huésped: no debe auditarse.
insert into public.lodging_reservations(company_id,business_unit_id,room_id,origin,status,check_in,check_out,total_value)
select :'company_id',:'hu','00000000-0000-4000-8000-0000000d1005','direct','checked_in',d-1,d+2,1000 from (select (now() at time zone 'America/Santiago')::date d) x;

-- ---------- Meta semanal y candidatas (internas) ----------
do $$
declare hu uuid := (select id from public.business_units where code='HU'); hoc uuid := (select id from public.business_units where code='HOC');
 t jsonb; a2 numeric; a1 numeric; picks_a2 int := 0; picks_a1 int := 0; pick uuid; i int;
begin
  t := public.lodging_audit_target(hu,public.lodging_week_start((now() at time zone 'America/Santiago')::date));
  -- 6 limpiezas × 20% = 1,2 → mínimo 3; acotado a 5 habitaciones distintas.
  if (t->>'cleaned')::int<>6 or (t->>'target')::int<>3 then raise exception 'Meta HU incorrecta: %',t; end if;
  t := public.lodging_audit_target(hoc,public.lodging_week_start((now() at time zone 'America/Santiago')::date));
  -- Solo 2 habitaciones limpiadas: la meta no puede superar lo auditable.
  if (t->>'target')::int<>2 then raise exception 'Meta HOC incorrecta: %',t; end if;

  if (select count(*) from public.lodging_audit_candidates(hu))<>4 then raise exception 'Candidatas HU: %',(select array_agg(room_name) from public.lodging_audit_candidates(hu)); end if;
  if exists(select 1 from public.lodging_audit_candidates(hu) where room_name in('Aud 5','Aud 6')) then raise exception 'Ocupada o no inspeccionada entre candidatas'; end if;
  select score into a2 from public.lodging_audit_candidates(hu) where room_name='Aud 2';
  select score into a1 from public.lodging_audit_candidates(hu) where room_name='Aud 1';
  if a2<=a1 then raise exception 'El rechazo previo y retrabajo deben subir el riesgo (a2 %, a1 %)',a2,a1; end if;
  -- Muestreo ponderado: la de más riesgo sale más veces, pero la aleatoriedad también elige otras.
  for i in 1..400 loop
    select room_id into pick from public.lodging_audit_candidates(hu) c order by -ln(greatest(random(),1e-12))/c.score limit 1;
    if pick='00000000-0000-4000-8000-0000000d1002' then picks_a2 := picks_a2+1; end if;
    if pick='00000000-0000-4000-8000-0000000d1001' then picks_a1 := picks_a1+1; end if;
  end loop;
  if picks_a2<=picks_a1 or picks_a1=0 then raise exception 'Ponderación incorrecta: a2=% a1=%',picks_a2,picks_a1; end if;
end $$;

set local role authenticated;

-- ---------- Sin permiso de auditoría ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_audit_draw((select id from public.business_units where code='HU')); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción no debe auditar'; end if;
  if exists(select 1 from public.lodging_supervisor_audits) then raise exception 'Recepción no ve auditorías'; end if;
end $$;

-- ---------- Supervisor: aprobar, descartar, fallar ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'sup'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); a uuid; b uuid; c uuid; d uuid; e uuid; failed boolean;
 ok jsonb := '{"presentacion":"ok","limpieza":"ok","cama":"ok","bano":"ok","toallas":"ok","agua_caliente":"ok","equipamiento":"ok","iluminacion":"ok","olores":"ok","desperfectos":"ok"}';
 s jsonb; k jsonb; h jsonb; room_a uuid;
begin
  a := public.lodging_audit_draw(hu);
  if public.lodging_audit_draw(hu)<>a then raise exception 'Con una auditoría abierta no se puede volver a sortear'; end if;
  select room_id into room_a from public.lodging_supervisor_audits where id=a;
  if room_a in('00000000-0000-4000-8000-0000000d1005','00000000-0000-4000-8000-0000000d1006') then raise exception 'Seleccionó una habitación no auditable'; end if;
  if (public.lodging_audit_detail(a)->>'housekeeper')<>'María Aseo' or (public.lodging_audit_detail(a)->>'inspector')<>'Carla Recepción' then raise exception 'Faltan responsables en el detalle'; end if;

  failed := false;
  begin perform public.lodging_audit_submit(a,'{"cama":"regular"}'::jsonb,null,null,null,null,null); exception when others then failed := true; end;
  if not failed then raise exception 'Checklist inválido aceptado'; end if;
  perform public.lodging_audit_submit(a,ok||'{"olores":"observation"}'::jsonb,'Leve olor a humedad',null,null,null,null);
  if (select status from public.lodging_supervisor_audits where id=a)<>'passed' then raise exception 'Con observaciones y sin fallas debe aprobar'; end if;
  if (select operational_status from public.lodging_rooms where id=room_a)<>'inspected' then raise exception 'Aprobar no cambia el estado de la habitación'; end if;

  b := public.lodging_audit_draw(hu);
  if (select room_id from public.lodging_supervisor_audits where id=b)=room_a then raise exception 'Repitió habitación en la misma semana'; end if;
  failed := false;
  begin perform public.lodging_audit_skip(b,''); exception when others then failed := true; end;
  if not failed then raise exception 'Descartar sin motivo'; end if;
  perform public.lodging_audit_skip(b,'Huésped adelantó su llegada');

  c := public.lodging_audit_draw(hu);
  failed := false;
  begin perform public.lodging_audit_submit(c,ok||'{"bano":"fail"}'::jsonb,'',null,null,null,null); exception when others then failed := true; end;
  if not failed then raise exception 'Falla sin observación aceptada'; end if;
  perform public.lodging_audit_submit(c,ok||'{"bano":"fail"}'::jsonb,'Baño con sarro en la ducha','housekeeping','bano','high','reclean');
  if (select status||'/'||action from public.lodging_supervisor_audits where id=c)<>'failed/reclean' then raise exception 'Auditoría fallida mal registrada'; end if;
  if (select r.operational_status from public.lodging_rooms r join public.lodging_supervisor_audits x on x.room_id=r.id where x.id=c)<>'dirty' then raise exception 'Nueva limpieza no generada'; end if;
  if not exists(select 1 from public.lodging_housekeeping_tasks t join public.lodging_supervisor_audits x on x.reclean_task_id=t.id where x.id=c and t.origin='audit' and t.status='pending') then
    raise exception 'Falta la tarea de aseo por auditoría'; end if;

  d := public.lodging_audit_draw(hu);
  perform public.lodging_audit_submit(d,ok||'{"agua_caliente":"fail"}'::jsonb,'Calefón no enciende','technical','agua_caliente','critical','incident');
  if not exists(select 1 from public.lodging_incidents i join public.lodging_supervisor_audits x on x.incident_id=i.id where x.id=d and i.source='audit' and i.priority='critical' and i.status='open') then
    raise exception 'Falta la incidencia generada'; end if;

  -- Resumen semanal multi-hostal y cumplimiento.
  s := public.lodging_audit_week_summary(null);
  select u into k from jsonb_array_elements(s->'units') u where u->>'code'='HU';
  if (k->>'target')::int<>3 or (k->>'done')::int<>3 or (k->>'passed')::int<>1 or (k->>'failed')::int<>2 or (k->>'skipped')::int<>1
     or (k->>'compliance')::numeric<>100 or (k->>'pending')::int<>0 or (k->>'incidents')::int<>1 or (k->>'findings')::int<>3 then raise exception 'Resumen HU incorrecto: %',k; end if;
  select u into k from jsonb_array_elements(s->'units') u where u->>'code'='HOC';
  if (k->>'done')::int<>0 or (k->>'compliance')::numeric<>0 or (k->>'target')::int<>2 then raise exception 'Resumen HOC incorrecto: %',k; end if;
  if jsonb_array_length(s->'units')<>2 then raise exception 'El supervisor debe ver sus 2 hostales'; end if;

  -- KPIs del mes e histórico.
  k := public.lodging_audit_month_kpis(hu,(now() at time zone 'America/Santiago')::date);
  if (k->>'audits')::int<>3 or (k->>'failed')::int<>2 or (k->>'reception_discrepancy')::int<>1 or jsonb_array_length(k->'categories')<>2 then raise exception 'KPIs del mes: %',k; end if;
  h := public.lodging_room_history((select room_id from public.lodging_supervisor_audits where id=c),50);
  if not exists(select 1 from jsonb_array_elements(h->'items') x where x->>'kind'='audit' and x->'data'->>'result'='failed')
     or not exists(select 1 from jsonb_array_elements(h->'items') x where x->>'kind'='cleaning')
     or not exists(select 1 from jsonb_array_elements(h->'items') x where x->>'kind'='inspection') then raise exception 'Histórico incompleto: %',h; end if;

  -- Auditoría de HOC y agotamiento de candidatas.
  e := public.lodging_audit_draw((select id from public.business_units where code='HOC'));
  perform public.lodging_audit_submit(e,ok,null,null,null,null,null);
  e := public.lodging_audit_draw((select id from public.business_units where code='HOC'));
  perform public.lodging_audit_submit(e,ok,null,null,null,null,null);
  failed := false;
  begin perform public.lodging_audit_draw((select id from public.business_units where code='HOC')); exception when others then failed := sqlerrm like '%No hay habitaciones auditables%'; end;
  if not failed then raise exception 'Debe avisar que no quedan habitaciones auditables'; end if;
end $$;

-- ---------- Otro supervisor sin acceso a HU ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'sup2'),true);
do $$ declare failed boolean := false; x uuid := (select id from public.lodging_supervisor_audits limit 1);
begin
  begin perform public.lodging_audit_draw((select id from public.business_units where code='HU')); exception when others then failed := true; end;
  if not failed then raise exception 'Supervisor sin acceso auditó HU'; end if;
  if exists(select 1 from public.lodging_supervisor_audits where business_unit_id=(select id from public.business_units where code='HU')) then raise exception 'Ve auditorías de HU'; end if;
  if jsonb_array_length(public.lodging_audit_week_summary(null)->'units')<>1 then raise exception 'Debe ver solo HOC'; end if;
  failed := false;
  begin perform public.lodging_audit_month_kpis((select id from public.business_units where code='HU'),current_date); exception when others then failed := true; end;
  if not failed then raise exception 'Vio KPIs de HU'; end if;
end $$;

select 'lodging audits ok' as result;
rollback;
