\set ON_ERROR_STOP on
begin;

-- Verifica el portal operativo (fases A–D): check-out → dirty → cleaning →
-- pending_inspection → inspected, rechazo con retrabajo, una sola limpieza por
-- habitación, check-in bloqueado y override autorizado, mantención que vuelve a
-- inspección, salidas automáticas sin check-out y aislamiento por permisos/unidad.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc_unit_id from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set admin_id '00000000-0000-4000-8000-0000000c0001'
\set clerk_id '00000000-0000-4000-8000-0000000c0002'
\set maid_id '00000000-0000-4000-8000-0000000c0003'
\set maid2_id '00000000-0000-4000-8000-0000000c0004'
\set other_id '00000000-0000-4000-8000-0000000c0005'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@ops.test','x',now(),now(),now()
from unnest(array[:'admin_id',:'clerk_id',:'maid_id',:'maid2_id',:'other_id']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='superadmin'),'Ana','Admin',:'admin_id'||'@ops.test','Pruebas',:'admin_id'),
 (:'clerk_id',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk_id'||'@ops.test','Pruebas',:'admin_id'),
 (:'maid_id',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid_id'||'@ops.test','Pruebas',:'admin_id'),
 (:'maid2_id',(select id from public.roles where key='housekeeping'),'Andrea','Aseo',:'maid2_id'||'@ops.test','Pruebas',:'admin_id'),
 (:'other_id',(select id from public.roles where key='housekeeping'),'Otra','Unidad',:'other_id'||'@ops.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'admin_id',:'clerk_id',:'maid_id',:'maid2_id',:'other_id']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'admin_id',:'company_id',:'hu_unit_id'),(:'clerk_id',:'company_id',:'hu_unit_id'),
 (:'maid_id',:'company_id',:'hu_unit_id'),(:'maid2_id',:'company_id',:'hu_unit_id'),(:'other_id',:'company_id',:'hoc_unit_id');

-- Habitaciones propias de la prueba (las de HU se desactivan en la transacción).
update public.lodging_rooms set active=false where business_unit_id=:'hu_unit_id';
update public.lodging_reservations set status='cancelled' where business_unit_id=:'hu_unit_id' and status not in('cancelled','conflict');
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order) values
 ('00000000-0000-4000-8000-0000000c1001',:'company_id',:'hu_unit_id','OP1','Hab 1',1),
 ('00000000-0000-4000-8000-0000000c1002',:'company_id',:'hu_unit_id','OP2','Hab 2',2),
 ('00000000-0000-4000-8000-0000000c1003',:'company_id',:'hu_unit_id','OP3','Hab 3',3);
create temp table ctx as select (now() at time zone 'America/Santiago')::date as today;
grant select on ctx to authenticated;
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,total_value,departure_processed_at)
select '00000000-0000-4000-8000-0000000c2001'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000c1001'::uuid,'direct','checked_in',today-1,today+1,50000,null::timestamptz from ctx union all
select '00000000-0000-4000-8000-0000000c2002'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000c1002'::uuid,'direct','confirmed',today,today+2,40000,null from ctx union all
select '00000000-0000-4000-8000-0000000c2003'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000c1003'::uuid,'airbnb','confirmed',today-3,today-1,0,null from ctx;
insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,registered_by)
values(:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000c2001','total','transfer',50000,:'admin_id');

set local role authenticated;

-- ---------- Recepción hace check-out: la habitación queda sucia con tarea ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
select public.lodging_check_out('00000000-0000-4000-8000-0000000c2001');
do $$ begin
  if (select operational_status from public.lodging_rooms where code='OP1')<>'dirty' then raise exception 'check-out debe dejar dirty'; end if;
  if (select count(*) from public.lodging_housekeeping_tasks where room_id='00000000-0000-4000-8000-0000000c1001' and status='pending' and origin='checkout')<>1 then
    raise exception 'check-out debe crear la tarea de aseo'; end if;
  if (select status from public.lodging_rooms where code='OP1')<>'cleaning' then raise exception 'el estado general debe acompañar (cleaning)'; end if;
end $$;

-- ---------- Aseo: solo ve el tablero operacional, no reservas ni pagos ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid_id'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); b jsonb; failed boolean;
begin
  if exists(select 1 from public.lodging_reservations) or exists(select 1 from public.lodging_reservation_payments) then
    raise exception 'Aseo no debe ver reservas ni pagos'; end if;
  if exists(select 1 from public.lodging_daily_closings) or exists(select 1 from public.lodging_monthly_closings) then
    raise exception 'Aseo no debe ver información financiera'; end if;
  b := public.lodging_ops_board(hu);
  if b::text ~ '(total_value|amount|guest_name|full_name|phone)' then raise exception 'El tablero expone datos sensibles: %',b; end if;
  if (select r->>'operational_status' from jsonb_array_elements(b->'rooms') r where r->>'name'='Hab 1')<>'dirty' then raise exception 'Tablero sin la habitación sucia'; end if;
  if (select (r->'next_arrival'->>'time') from jsonb_array_elements(b->'rooms') r where r->>'name'='Hab 2') is null then raise exception 'Falta la hora del próximo check-in'; end if;
  failed := false;
  begin perform public.lodging_check_out('00000000-0000-4000-8000-0000000c2002'); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo no puede hacer check-out'; end if;
  perform public.lodging_housekeeping_start('00000000-0000-4000-8000-0000000c1001');
  if (select operational_status from public.lodging_rooms where code='OP1')<>'cleaning' then raise exception 'dirty → cleaning'; end if;
  failed := false;
  begin perform public.lodging_room_inspect('00000000-0000-4000-8000-0000000c1001',true,'{}'::jsonb,null,null); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo no puede inspeccionar'; end if;
end $$;

-- Una segunda persona no puede tomar ni finalizar la misma limpieza.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid2_id'),true);
do $$ declare failed boolean := false; t uuid := (select id from public.lodging_housekeeping_tasks where status='in_progress' and room_id='00000000-0000-4000-8000-0000000c1001');
begin
  begin perform public.lodging_housekeeping_start('00000000-0000-4000-8000-0000000c1001'); exception when others then failed := sqlerrm like '%siendo limpiada por María%'; end;
  if not failed then raise exception 'Dos personas tomaron la misma habitación'; end if;
  failed := false;
  begin perform public.lodging_housekeeping_finish(t,'{"cama":true}'::jsonb,null); exception when others then failed := true; end;
  if not failed then raise exception 'Otra persona finalizó una limpieza ajena'; end if;
end $$;

-- No se puede saltar la limpieza ni la inspección.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_room_inspect('00000000-0000-4000-8000-0000000c1001',true,'{}'::jsonb,null,null); exception when others then failed := true; end;
  if not failed then raise exception 'Se inspeccionó una habitación en limpieza'; end if;
end $$;

select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid_id'),true);
select public.lodging_housekeeping_finish((select id from public.lodging_housekeeping_tasks where status='in_progress' and room_id='00000000-0000-4000-8000-0000000c1001'),'{"cama":true,"bano":true}'::jsonb,'Todo ok');
do $$ begin
  if (select operational_status from public.lodging_rooms where code='OP1')<>'pending_inspection' then raise exception 'cleaning → pending_inspection'; end if;
  if (select duration_minutes from public.lodging_housekeeping_tasks where room_id='00000000-0000-4000-8000-0000000c1001' and status='completed') is null then raise exception 'Falta duración'; end if;
end $$;

-- ---------- Recepción rechaza: vuelve a aseo como retrabajo ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_room_inspect('00000000-0000-4000-8000-0000000c1001',false,'{"bano":false}'::jsonb,'',null); exception when others then failed := true; end;
  if not failed then raise exception 'Rechazo sin motivo'; end if;
  perform public.lodging_room_inspect('00000000-0000-4000-8000-0000000c1001',false,'{"bano":false}'::jsonb,'Baño mal limpiado',null);
  if (select operational_status||'/'||rework from public.lodging_rooms where code='OP1')<>'dirty/true' then raise exception 'El rechazo debe volver a dirty con retrabajo'; end if;
  if (select attempt from public.lodging_housekeeping_tasks where room_id='00000000-0000-4000-8000-0000000c1001' and status='pending' and origin='rework')<>2 then raise exception 'Falta la tarea de retrabajo'; end if;
end $$;

select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid_id'),true);
select public.lodging_housekeeping_start('00000000-0000-4000-8000-0000000c1001');
select public.lodging_housekeeping_finish((select id from public.lodging_housekeeping_tasks where status='in_progress' and room_id='00000000-0000-4000-8000-0000000c1001'),'{"bano":true}'::jsonb,null);
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
select public.lodging_room_inspect('00000000-0000-4000-8000-0000000c1001',true,'{"cama":true}'::jsonb,null,null);
do $$ begin
  if (select operational_status||'/'||rework||'/'||status from public.lodging_rooms where code='OP1')<>'inspected/false/available' then raise exception 'Aprobación debe dejar inspected y disponible'; end if;
  if (select count(*) from public.lodging_room_inspections where room_id='00000000-0000-4000-8000-0000000c1001')<>2 then raise exception 'Deben quedar 2 inspecciones'; end if;
  if (select string_agg(to_status,'>' order by created_at) from public.lodging_room_status_events where room_id='00000000-0000-4000-8000-0000000c1001')
     <>'dirty>cleaning>pending_inspection>dirty>cleaning>pending_inspection>inspected' then
    raise exception 'Historial incompleto: %',(select string_agg(to_status,'>' order by created_at) from public.lodging_room_status_events where room_id='00000000-0000-4000-8000-0000000c1001'); end if;
end $$;

-- ---------- Check-in bloqueado y override ----------
reset role;
update public.lodging_rooms set operational_status='dirty' where code='OP2';
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_check_in('00000000-0000-4000-8000-0000000c2002',null); exception when others then failed := sqlerrm like '%no ha sido liberada%'; end;
  if not failed then raise exception 'Check-in debe bloquearse sin inspección'; end if;
  failed := false;
  begin perform public.lodging_check_in('00000000-0000-4000-8000-0000000c2002','Huésped esperando'); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción no tiene permiso de override'; end if;
end $$;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);
select public.lodging_check_in('00000000-0000-4000-8000-0000000c2002','Huésped esperando, aseo en curso');
reset role;
do $$ begin
  if (select status from public.lodging_reservations where id='00000000-0000-4000-8000-0000000c2002')<>'checked_in' then raise exception 'Override no hizo check-in'; end if;
  if not exists(select 1 from public.audit_logs where action='checkin_override' and entity_id='00000000-0000-4000-8000-0000000c2002'
     and new_data->>'reason'='Huésped esperando, aseo en curso' and old_data->>'previous_status'='dirty') then raise exception 'Override sin auditoría'; end if;
end $$;

-- ---------- Mantención: al salir vuelve a inspección, nunca disponible directo ----------
update public.lodging_rooms set status='maintenance' where code='OP1';
do $$ begin if (select operational_status from public.lodging_rooms where code='OP1')<>'maintenance' then raise exception 'Mantención no sincronizada'; end if; end $$;
update public.lodging_rooms set status='available' where code='OP1';
do $$ begin if (select operational_status from public.lodging_rooms where code='OP1')<>'pending_inspection' then raise exception 'Resolución de mantención debe quedar pending_inspection'; end if; end $$;

-- ---------- Salida sin check-out registrado (Airbnb) ----------
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid_id'),true);
do $$ declare hu uuid := (select id from public.business_units where code='HU');
begin
  if public.lodging_ops_sync_departures(hu)<>1 then raise exception 'Debió ensuciar la habitación de la salida sin check-out'; end if;
  if public.lodging_ops_sync_departures(hu)<>0 then raise exception 'La sincronización debe ser idempotente'; end if;
end $$;
reset role;
do $$ begin
  if (select operational_status from public.lodging_rooms where code='OP3')<>'dirty' then raise exception 'OP3 debe quedar dirty'; end if;
  if (select origin from public.lodging_housekeeping_tasks where room_id='00000000-0000-4000-8000-0000000c1003' and status='pending')<>'auto_departure' then raise exception 'Origen incorrecto'; end if;
end $$;

-- ---------- Aseo de otra unidad no ve HU ----------
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'other_id'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_ops_board((select id from public.business_units where code='HU')); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo de otra unidad vio HU'; end if;
  if exists(select 1 from public.lodging_housekeeping_tasks) then raise exception 'Aseo de otra unidad ve tareas de HU'; end if;
  failed := false;
  begin perform public.lodging_housekeeping_start('00000000-0000-4000-8000-0000000c1003'); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo de otra unidad tomó una habitación de HU'; end if;
end $$;

select 'lodging operations ok' as result;
rollback;
