\set ON_ERROR_STOP on
begin;

-- Verifica incidencias y mantención (fase E): reporte desde aseo/recepción,
-- bloqueo por permiso, gestión (asignar, iniciar, resolver, cancelar), vuelta a
-- pending_inspection solo cuando no queda otra incidencia bloqueante, fotos con
-- ruta validada, alerta de llegada próxima, tablero y aislamiento por unidad.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set admin '00000000-0000-4000-8000-0000000e0001'
\set maid '00000000-0000-4000-8000-0000000e0002'
\set clerk '00000000-0000-4000-8000-0000000e0003'
\set other '00000000-0000-4000-8000-0000000e0004'
\set r1 '00000000-0000-4000-8000-0000000e1001'
\set r2 '00000000-0000-4000-8000-0000000e1002'
\set rc '00000000-0000-4000-8000-0000000e2001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@inc.test','x',now(),now(),now() from unnest(array[:'admin',:'maid',:'clerk',:'other']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@inc.test','Pruebas',:'admin'),
 (:'maid',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid'||'@inc.test','Pruebas',:'admin'),
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@inc.test','Pruebas',:'admin'),
 (:'other',(select id from public.roles where key='receptionist'),'Otra','Recepción',:'other'||'@inc.test','Pruebas',:'admin');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'admin',:'maid',:'clerk',:'other']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'admin',:'company_id',:'hu'),(:'maid',:'company_id',:'hu'),(:'clerk',:'company_id',:'hu'),(:'other',:'company_id',:'hoc');

-- Aislamiento: se cierran las incidencias existentes de HU y HOC (se revierte al final).
update public.lodging_incidents set status='cancelled',cancel_reason='Aislamiento de prueba',resolved_at=now(),room_released_at=coalesce(room_released_at,now())
where business_unit_id in(:'hu',:'hoc') and status in('open','assigned','in_progress');
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order,operational_status) values
 (:'r1',:'company_id',:'hu','IN1','Inc 1',91,'inspected'),(:'r2',:'company_id',:'hu','IN2','Inc 2',92,'inspected'),
 (:'rc',:'company_id',:'hoc','IC1','Inc C',91,'inspected');
-- Llegada mañana a Inc 1: si queda bloqueada debe alertar.
insert into public.lodging_reservations(company_id,business_unit_id,room_id,origin,status,check_in,check_out,total_value,guest_count)
select :'company_id',:'hu',:'r1','direct','confirmed',d+1,d+3,1000,2 from (select (now() at time zone 'America/Santiago')::date d) x;

-- Estado de la habitación sin depender del RLS de quien ejecuta la prueba.
create function pg_temp.room_state(r uuid) returns text language sql security definer as $$ select operational_status||'/'||status from public.lodging_rooms where id=r $$;

set local role authenticated;

-- ---------- Aseo reporta, pero no puede bloquear ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid'),true);
do $$ declare failed boolean := false; x uuid; hu uuid := (select id from public.business_units where code='HU');
begin
  x := public.lodging_incident_report(jsonb_build_object('unit_id',hu,'room_id','00000000-0000-4000-8000-0000000e1002','category','tv','description','No enciende la TV','priority','low'));
  if (select source from public.lodging_incidents where id=x) is not null then raise exception 'Aseo no debe ver la lista de incidencias (RLS)'; end if;
  if (public.lodging_incident_detail(x)->>'source') is distinct from 'housekeeping' then raise exception 'Origen debe ser aseo'; end if;
  begin perform public.lodging_incident_report(jsonb_build_object('unit_id',hu,'room_id','00000000-0000-4000-8000-0000000e1002','category','agua_caliente','description','Sin agua','block','maintenance'));
  exception when others then failed := sqlerrm like '%Sin autorizacion para bloquear%'; end;
  if not failed then raise exception 'Aseo no puede bloquear habitaciones'; end if;
  failed := false;
  begin perform public.lodging_incident_report(jsonb_build_object('unit_id',(select id from public.business_units where code='HOC'),'category','otro','description','Ajena'));
  exception when others then failed := true; end;
  if not failed then raise exception 'Aseo reportó en un hostal no asignado'; end if;
  failed := false;
  begin perform public.lodging_incident_update(x,'start','{}'); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo no puede gestionar'; end if;
  if split_part(pg_temp.room_state('00000000-0000-4000-8000-0000000e1002'),'/',1) is distinct from 'inspected' then raise exception 'Sin bloqueo el estado no cambia'; end if;
end $$;

-- ---------- Recepción reporta y bloquea por mantención; no puede dejar fuera de servicio ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare failed boolean := false; x uuid; b jsonb; room jsonb; hu uuid := (select id from public.business_units where code='HU');
begin
  begin perform public.lodging_incident_report(jsonb_build_object('unit_id',hu,'room_id','00000000-0000-4000-8000-0000000e1001','category','plomeria','description','Fuga','block','out_of_service'));
  exception when others then failed := sqlerrm like '%fuera de servicio%'; end;
  if not failed then raise exception 'Recepción no puede dejar fuera de servicio'; end if;
  x := public.lodging_incident_report(jsonb_build_object('unit_id',hu,'room_id','00000000-0000-4000-8000-0000000e1001','category','agua_caliente','description','No sale agua caliente','priority','high','block','maintenance'));
  if pg_temp.room_state('00000000-0000-4000-8000-0000000e1001') is distinct from 'maintenance/maintenance' then raise exception 'Debe quedar en mantención'; end if;
  if not exists(select 1 from public.lodging_room_status_events where room_id='00000000-0000-4000-8000-0000000e1001' and to_status='maintenance' and source='maintenance') then raise exception 'Falta evento de estado'; end if;
  if (select source from public.lodging_incidents where id=x) is distinct from 'reception' then raise exception 'Origen debe ser recepción'; end if;
  b := public.lodging_incident_board(hu);
  if (select count(*) from jsonb_array_elements(b) e where e->>'id'=x::text and e->'upcoming_arrival' is not null and (e->'upcoming_arrival'->>'guests')::int=2) is distinct from 1 then raise exception 'Falta alerta de llegada próxima: %',b; end if;
  if (select (e->>'sort_key')::int from jsonb_array_elements(b) e limit 1) is distinct from 1 then raise exception 'La prioridad alta debe ir primero'; end if;
  select e into room from jsonb_array_elements(public.lodging_ops_board(hu)->'rooms') e where e->>'id'='00000000-0000-4000-8000-0000000e1001';
  if not (room->'incidents'->>'blocking')::boolean or (room->'incidents'->>'open')::int<>1 or room->'incidents'->>'top_priority'<>'high' then raise exception 'Tablero sin incidencia: %',room; end if;
  if (public.lodging_ops_board(hu)->>'incidents_open')::int<2 then raise exception 'Conteo de incidencias abiertas'; end if;
  failed := false;
  begin perform public.lodging_incident_update(x,'resolve','{"notes":"arreglado"}'); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción no puede resolver'; end if;
  begin perform public.lodging_unit_staff(hu); failed := false; exception when others then failed := true; end;
  if not failed then raise exception 'Recepción no lista personal'; end if;
end $$;

-- ---------- Recepción de otro hostal no ve HU ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'other'),true);
do $$ declare failed boolean := false;
begin
  if exists(select 1 from public.lodging_incidents where business_unit_id=(select id from public.business_units where code='HU')) then raise exception 'Ve incidencias de HU'; end if;
  begin perform public.lodging_incident_board((select id from public.business_units where code='HU')); exception when others then failed := true; end;
  if not failed then raise exception 'Vio el tablero de HU'; end if;
  failed := false;
  begin perform public.lodging_incident_detail((select id from public.lodging_incidents where room_id='00000000-0000-4000-8000-0000000e1001')); exception when others then failed := true; end;
  if not failed then raise exception 'Vio el detalle de HU'; end if;
end $$;

-- ---------- Administración: gestionar, dos bloqueos, fotos ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ declare failed boolean := false; x uuid; y uuid; hu uuid := (select id from public.business_units where code='HU'); c uuid := (select id from public.companies where code='OASIS');
 r1 uuid := '00000000-0000-4000-8000-0000000e1001'; i int;
begin
  select id into x from public.lodging_incidents where room_id=r1;
  -- Asignar solo a personal de la unidad.
  begin perform public.lodging_incident_update(x,'assign',jsonb_build_object('assigned_to','00000000-0000-4000-8000-0000000e0004')); exception when others then failed := sqlerrm like '%Responsable invalido%'; end;
  if not failed then raise exception 'Asignó a personal de otra unidad'; end if;
  if (select count(*) from public.lodging_unit_staff(hu) where staff_id in('00000000-0000-4000-8000-0000000e0002','00000000-0000-4000-8000-0000000e0004')) is distinct from 1 then raise exception 'Personal de la unidad'; end if;
  perform public.lodging_incident_update(x,'assign',jsonb_build_object('assigned_to','00000000-0000-4000-8000-0000000e0002'));
  if (select status from public.lodging_incidents where id=x) is distinct from 'assigned' then raise exception 'Debe quedar asignada'; end if;
  perform public.lodging_incident_update(x,'start','{}');
  if (select status from public.lodging_incidents where id=x) is distinct from 'in_progress' then raise exception 'Debe quedar en curso'; end if;

  -- Segunda incidencia que deja fuera de servicio la misma habitación.
  y := public.lodging_incident_report(jsonb_build_object('unit_id',hu,'room_id',r1,'category','electricidad','description','Enchufe quemado','priority','critical','block','out_of_service'));
  if (select source from public.lodging_incidents where id=y) is distinct from 'manual' then raise exception 'Origen de administración'; end if;
  if split_part(pg_temp.room_state(r1),'/',1) is distinct from 'out_of_service' then raise exception 'Debe quedar fuera de servicio'; end if;

  -- Fotos: ruta validada y máximo 5.
  begin perform public.lodging_incident_attach(x,c||'/'||hu||'/'||y||'/a.jpg','image/jpeg',100,'a.jpg'); exception when others then failed := sqlerrm like '%Ruta invalida%'; end;
  if not failed then raise exception 'Aceptó ruta de otra incidencia'; end if;
  for i in 1..5 loop perform public.lodging_incident_attach(x,c||'/'||hu||'/'||x||'/'||i||'.jpg','image/jpeg',100,i||'.jpg'); end loop;
  failed := false;
  begin perform public.lodging_incident_attach(x,c||'/'||hu||'/'||x||'/6.jpg','image/jpeg',100,'6.jpg'); exception when others then failed := sqlerrm like '%Maximo 5%'; end;
  if not failed then raise exception 'Debe limitar a 5 fotos'; end if;
  if jsonb_array_length(public.lodging_incident_detail(x)->'attachments') is distinct from 5 then raise exception 'Detalle sin fotos'; end if;

  -- Resolver exige notas; al resolver una, la otra mantiene el bloqueo.
  failed := false;
  begin perform public.lodging_incident_update(x,'resolve','{"notes":""}'); exception when others then failed := sqlerrm like '%como se resolvio%'; end;
  if not failed then raise exception 'Resolver exige notas'; end if;
  perform public.lodging_incident_update(x,'resolve','{"notes":"Se cambió el calefont"}');
  if split_part(pg_temp.room_state(r1),'/',1) is distinct from 'out_of_service' then raise exception 'Otra incidencia sigue bloqueando'; end if;
  failed := false;
  begin perform public.lodging_incident_update(x,'start','{}'); exception when others then failed := sqlerrm like '%ya esta cerrada%'; end;
  if not failed then raise exception 'No se gestiona una cerrada'; end if;
  -- Cancelar la última: vuelve a pending_inspection, nunca disponible directo.
  failed := false;
  begin perform public.lodging_incident_update(y,'cancel','{}'); exception when others then failed := sqlerrm like '%motivo%'; end;
  if not failed then raise exception 'Cancelar exige motivo'; end if;
  perform public.lodging_incident_update(y,'cancel','{"reason":"Duplicada"}');
  if pg_temp.room_state(r1) is distinct from 'pending_inspection/available' then raise exception 'Debe volver a pendiente de inspección: %',split_part(pg_temp.room_state(r1),'/',1); end if;
  if exists(select 1 from public.lodging_incidents where room_id=r1 and room_released_at is null) then raise exception 'Bloqueos liberados'; end if;
  if (select e->'upcoming_arrival' from jsonb_array_elements(public.lodging_incident_board(hu)) e where e->>'id'=y::text) is distinct from 'null'::jsonb then raise exception 'Sin bloqueo no hay alerta'; end if;
  if exists(select 1 from jsonb_array_elements(public.lodging_ops_board(hu)->'rooms') e where e->>'id'=r1::text and (e->'incidents'->>'open')::int>0) then raise exception 'Tablero sigue con incidencias'; end if;

  -- Bloquear y liberar manualmente una incidencia existente.
  select id into x from public.lodging_incidents where room_id='00000000-0000-4000-8000-0000000e1002';
  perform public.lodging_incident_update(x,'block','{"kind":"maintenance"}');
  if split_part(pg_temp.room_state('00000000-0000-4000-8000-0000000e1002'),'/',1) is distinct from 'maintenance' then raise exception 'Bloqueo manual'; end if;
  perform public.lodging_incident_update(x,'unblock','{}');
  if split_part(pg_temp.room_state('00000000-0000-4000-8000-0000000e1002'),'/',1) is distinct from 'pending_inspection' then raise exception 'Liberación manual'; end if;
  if (select status from public.lodging_incidents where id=x) is distinct from 'open' then raise exception 'Liberar no cierra la incidencia'; end if;
end $$;

-- Las tablas nuevas no admiten escritura directa.
do $$ declare failed boolean := false;
begin
  begin update public.lodging_incidents set status='resolved'; exception when others then failed := true; end;
  if not failed then raise exception 'Escritura directa en incidencias'; end if;
  failed := false;
  begin insert into public.lodging_incident_attachments(company_id,business_unit_id,incident_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
   select company_id,business_unit_id,id,'x','x','image/jpeg',1,auth.uid() from public.lodging_incidents limit 1; exception when others then failed := true; end;
  if not failed then raise exception 'Escritura directa en fotos'; end if;
end $$;

select 'lodging incidents ok' as result;
rollback;
