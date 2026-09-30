\set ON_ERROR_STOP on
begin;

-- Verifica el interruptor del circuito de aseo e inspección por hostal: sin
-- circuito el check-in no exige inspección y el check-out no ensucia la
-- habitación ni crea tareas; al desactivar se liberan las habitaciones
-- pendientes (no las de mantención) y se cancelan las tareas; solo
-- administración lo cambia.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin '00000000-0000-4000-8000-0000000f8001'
\set clerk '00000000-0000-4000-8000-0000000f8002'
\set r1 '00000000-0000-4000-8000-0000000f9001'
\set r2 '00000000-0000-4000-8000-0000000f9002'
\set r3 '00000000-0000-4000-8000-0000000f9003'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@toggle.test','x',now(),now(),now() from unnest(array[:'admin',:'clerk']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@toggle.test','Pruebas',:'admin'),
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@toggle.test','Pruebas',:'admin');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'admin',:'clerk']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'admin',:'clerk']) v;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p
 where r.key='administrator' and p.key in('lodging.reservations.manage','lodging.reservations.view') on conflict do nothing;

-- Parte con el circuito activo en HU.
update public.lodging_ops_settings set housekeeping_enabled=true where business_unit_id=:'hu';
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order,operational_status,status) values
 (:'r1',:'company_id',:'hu','TG1','Toggle 1',91,'dirty','cleaning'),
 (:'r2',:'company_id',:'hu','TG2','Toggle 2',92,'maintenance','maintenance'),
 (:'r3',:'company_id',:'hu','TG3','Toggle 3',93,'dirty','available');
insert into public.lodging_housekeeping_tasks(company_id,business_unit_id,room_id,origin,status,attempt) values
 (:'company_id',:'hu',:'r1','checkout','pending',1);
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value) values
 ('00000000-0000-4000-8000-0000000fa001',:'company_id',:'hu',:'r3','direct','confirmed',current_date,current_date+1,100,100);

insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
values(:'company_id',:'hu','00000000-0000-4000-8000-0000000fa001','total','cash',100,now(),:'clerk');

create function pg_temp.room(r uuid) returns text language sql security definer as $$ select operational_status||'/'||status from public.lodging_rooms where id=r $$;
create function pg_temp.open_tasks(r uuid) returns bigint language sql security definer as $$ select count(*) from public.lodging_housekeeping_tasks where room_id=r and status in('pending','in_progress') $$;
set local role authenticated;

-- ---------- Recepción no cambia el interruptor ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare failed boolean := false;
begin
  if not public.lodging_ops_housekeeping_enabled((select id from public.business_units where code='HU')) then raise exception 'Debe estar activo'; end if;
  begin perform public.lodging_ops_set_housekeeping((select id from public.business_units where code='HU'),false); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción cambió el interruptor'; end if;
  -- Con circuito activo, el check-in exige inspección.
  failed := false;
  begin perform public.lodging_check_in('00000000-0000-4000-8000-0000000fa001',null); exception when others then failed := sqlerrm like '%liberada por inspeccion%'; end;
  if not failed then raise exception 'Con circuito activo debe exigir inspección'; end if;
end $$;

-- ---------- Administración lo desactiva ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$
begin
  perform public.lodging_ops_set_housekeeping((select id from public.business_units where code='HU'),false);
  if public.lodging_ops_housekeeping_enabled((select id from public.business_units where code='HU')) then raise exception 'Debe quedar desactivado'; end if;
  if pg_temp.room('00000000-0000-4000-8000-0000000f9001') is distinct from 'inspected/available' then raise exception 'Sucia se libera: %',pg_temp.room('00000000-0000-4000-8000-0000000f9001'); end if;
  if pg_temp.open_tasks('00000000-0000-4000-8000-0000000f9001') <> 0 then raise exception 'Tareas abiertas canceladas'; end if;
  if pg_temp.room('00000000-0000-4000-8000-0000000f9002') is distinct from 'maintenance/maintenance' then raise exception 'Mantención no se toca'; end if;
end $$;

-- ---------- Sin circuito: check-in sin inspección y check-out sin ensuciar ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
update public.lodging_rooms set operational_status='dirty' where id=:'r3';
do $$
begin
  perform public.lodging_check_in('00000000-0000-4000-8000-0000000fa001',null);
  if (select status from public.lodging_reservations where id='00000000-0000-4000-8000-0000000fa001') is distinct from 'checked_in' then raise exception 'Check-in sin inspección'; end if;
  perform public.lodging_check_out('00000000-0000-4000-8000-0000000fa001');
  if split_part(pg_temp.room('00000000-0000-4000-8000-0000000f9003'),'/',2) is distinct from 'available' then raise exception 'Check-out deja disponible: %',pg_temp.room('00000000-0000-4000-8000-0000000f9003'); end if;
  if pg_temp.open_tasks('00000000-0000-4000-8000-0000000f9003') <> 0 then raise exception 'Sin circuito no se crean tareas'; end if;
end $$;

reset role;
do $$
begin
  if not exists(select 1 from public.audit_logs where action='housekeeping_toggle' and new_data->>'housekeeping_enabled'='false' and actor_id='00000000-0000-4000-8000-0000000f8001') then raise exception 'Auditoría del cambio'; end if;
end $$;

select 'lodging housekeeping toggle ok' as result;
rollback;
