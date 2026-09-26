begin;

-- Portal operativo de hostales (fases A–D): estado operacional de cada
-- habitación independiente de la reserva, tareas de aseo, inspección del 100%
-- por recepción y check-in/check-out transaccionales.
--
-- Flujo: check-out → dirty → cleaning → pending_inspection → inspected.
-- Un rechazo de inspección devuelve la habitación a dirty marcada como
-- retrabajo. Toda transición pasa por funciones de esta migración (con la
-- fila bloqueada para evitar dobles tomas) y queda en lodging_room_status_events.

-- ---------- Permisos y roles ----------
insert into public.permissions(key,module,description) values
 ('lodging.housekeeping.view','lodging','Ver el tablero operacional de habitaciones'),
 ('lodging.housekeeping.execute','lodging','Tomar y finalizar limpiezas de habitaciones'),
 ('lodging.rooms.inspect','lodging','Inspeccionar habitaciones limpiadas (aprobar o rechazar)'),
 ('lodging.maintenance.view','lodging','Ver incidencias y mantenciones de habitaciones'),
 ('lodging.maintenance.manage','lodging','Gestionar incidencias, mantención y habitaciones fuera de servicio'),
 ('lodging.audits.execute','lodging','Realizar auditorías de supervisión'),
 ('lodging.audits.view','lodging','Ver auditorías de supervisión'),
 ('lodging.operations.view','lodging','Ver la operación y alertas del hostal'),
 ('lodging.operations.multi_unit','lodging','Ver la operación de varios hostales a la vez'),
 ('lodging.checkin.override','lodging','Hacer check-in en una habitación no liberada por inspección, con motivo')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.roles(key,name,description,is_system) values
 ('housekeeping','Aseo','Limpieza de habitaciones en el portal operativo',true),
 ('lodging_supervisor','Supervisor de hostales','Supervisión multi-hostal y auditorías',true)
on conflict(key) do update set name=excluded.name,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (r.key='housekeeping' and p.key in('lodging.housekeeping.view','lodging.housekeeping.execute'))
   or (r.key='receptionist' and p.key in('lodging.housekeeping.view','lodging.rooms.inspect','lodging.operations.view','lodging.maintenance.view'))
   or (r.key='lodging_supervisor' and p.key in('lodging.housekeeping.view','lodging.operations.view','lodging.operations.multi_unit','lodging.audits.execute','lodging.audits.view','lodging.maintenance.view'))
   or (r.key='general_manager' and p.key in('lodging.operations.view','lodging.operations.multi_unit','lodging.audits.view','lodging.maintenance.view'))
   or (r.key in('administrator','superadmin') and p.key in('lodging.housekeeping.view','lodging.housekeeping.execute','lodging.rooms.inspect',
      'lodging.maintenance.view','lodging.maintenance.manage','lodging.audits.execute','lodging.audits.view','lodging.operations.view',
      'lodging.operations.multi_unit','lodging.checkin.override'))
on conflict do nothing;

-- ---------- Estado operacional ----------
alter table public.lodging_rooms
 add column operational_status text not null default 'inspected'
  check(operational_status in('dirty','cleaning','pending_inspection','inspected','maintenance','out_of_service')),
 add column operational_status_changed_at timestamptz not null default now(),
 add column rework boolean not null default false;
update public.lodging_rooms set operational_status=case
  when status='cleaning' then 'dirty'
  when status in('maintenance','out_of_service') then status
  else 'inspected' end;
create index lodging_rooms_operational_idx on public.lodging_rooms(company_id,business_unit_id,operational_status) where active;

-- Salidas ya procesadas (check-out o paso automático a dirty). Las salidas
-- pasadas quedan marcadas para no ensuciar todas las habitaciones al activar.
alter table public.lodging_reservations add column departure_processed_at timestamptz;
update public.lodging_reservations set departure_processed_at=now()
where check_out<=(now() at time zone 'America/Santiago')::date;
create index lodging_reservations_departure_idx on public.lodging_reservations(business_unit_id,check_out) where departure_processed_at is null;

create table public.lodging_ops_settings(
 business_unit_id uuid primary key,
 company_id uuid not null references public.companies(id),
 default_checkin_time time not null default '14:00',
 default_checkout_time time not null default '12:00',
 audit_sample_pct numeric(5,2) not null default 15 check(audit_sample_pct between 0 and 100),
 audit_min_per_week integer not null default 3 check(audit_min_per_week>=0),
 facility_audit_days integer not null default 7 check(facility_audit_days in(7,14)),
 inspection_alert_minutes integer not null default 60 check(inspection_alert_minutes>0),
 dirty_alert_minutes integer not null default 120 check(dirty_alert_minutes>0),
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
insert into public.lodging_ops_settings(business_unit_id,company_id)
select id,company_id from public.business_units where code in('HU','HOC','HOB') and deleted_at is null
on conflict do nothing;

create table public.lodging_room_status_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_id uuid not null references public.lodging_rooms(id),
 from_status text,
 to_status text not null,
 source text not null default 'manual',
 reason text,
 task_id uuid,
 reservation_id uuid references public.lodging_reservations(id),
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_room_status_events_room_idx on public.lodging_room_status_events(room_id,created_at desc);
create index lodging_room_status_events_unit_idx on public.lodging_room_status_events(company_id,business_unit_id,created_at desc);

create table public.lodging_housekeeping_tasks(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_id uuid not null references public.lodging_rooms(id),
 reservation_id uuid references public.lodging_reservations(id),
 origin text not null check(origin in('checkout','auto_departure','rework','maintenance','manual')),
 status text not null default 'pending' check(status in('pending','in_progress','completed','cancelled')),
 attempt integer not null default 1 check(attempt>0),
 started_by uuid references public.profiles(id),started_at timestamptz,
 completed_by uuid references public.profiles(id),completed_at timestamptz,
 duration_minutes integer check(duration_minutes is null or duration_minutes>=0),
 checklist jsonb,
 notes text check(notes is null or char_length(notes)<=1000),
 created_at timestamptz not null default now(),created_by uuid references auth.users(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(status<>'in_progress' or (started_by is not null and started_at is not null)),
 check(status<>'completed' or (completed_at is not null and checklist is not null))
);
-- Una sola limpieza abierta por habitación: evita que dos personas la tomen a la vez.
create unique index lodging_housekeeping_tasks_open_room_idx on public.lodging_housekeeping_tasks(room_id) where status in('pending','in_progress');
create index lodging_housekeeping_tasks_unit_idx on public.lodging_housekeeping_tasks(company_id,business_unit_id,created_at desc);
alter table public.lodging_room_status_events add constraint lodging_room_status_events_task_fk foreign key(task_id) references public.lodging_housekeeping_tasks(id);

create table public.lodging_room_inspections(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_id uuid not null references public.lodging_rooms(id),
 task_id uuid references public.lodging_housekeeping_tasks(id),
 result text not null check(result in('approved','rejected')),
 checklist jsonb not null,
 rejection_reason text,
 notes text check(notes is null or char_length(notes)<=1000),
 inspector_id uuid not null references public.profiles(id),
 inspected_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(result<>'rejected' or char_length(coalesce(btrim(rejection_reason),''))>=3)
);
create unique index lodging_room_inspections_task_idx on public.lodging_room_inspections(task_id) where task_id is not null;
create index lodging_room_inspections_unit_idx on public.lodging_room_inspections(company_id,business_unit_id,inspected_at desc);
create index lodging_room_inspections_room_idx on public.lodging_room_inspections(room_id,inspected_at desc);

create trigger audit_lodging_housekeeping_tasks after insert or update or delete on public.lodging_housekeeping_tasks for each row execute function public.audit_row_change();
create trigger audit_lodging_room_inspections after insert or update or delete on public.lodging_room_inspections for each row execute function public.audit_row_change();
create trigger audit_lodging_ops_settings after insert or update or delete on public.lodging_ops_settings for each row execute function public.audit_row_change();

-- ---------- Historial automático de cada cambio de estado ----------
-- Las funciones fijan oasis.ops_source/reason/task/reservation en la transacción;
-- cambios hechos desde otras pantallas quedan con source='manual'.
create or replace function public.lodging_rooms_operational_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.operational_status is distinct from old.operational_status then
  new.operational_status_changed_at:=clock_timestamp();
  insert into public.lodging_room_status_events(company_id,business_unit_id,room_id,from_status,to_status,source,reason,task_id,reservation_id,actor_id)
  values(new.company_id,new.business_unit_id,new.id,old.operational_status,new.operational_status,
   coalesce(nullif(current_setting('oasis.ops_source',true),''),'manual'),
   nullif(current_setting('oasis.ops_reason',true),''),
   nullif(current_setting('oasis.ops_task',true),'')::uuid,
   nullif(current_setting('oasis.ops_reservation',true),'')::uuid,
   auth.uid());
 end if;
 return new;
end $$;

-- Si alguien cambia el estado general a mantención/fuera de servicio (pantalla de
-- habitaciones), el estado operacional lo acompaña; al salir de mantención la
-- habitación queda pendiente de inspección, nunca disponible directo.
create or replace function public.lodging_rooms_sync_operational() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status in('maintenance','out_of_service') then
   new.operational_status:=new.status;
  elsif old.status in('maintenance','out_of_service') and new.operational_status in('maintenance','out_of_service') then
   new.operational_status:='pending_inspection';
  end if;
 end if;
 return new;
end $$;
-- Los triggers BEFORE corren en orden alfabético: primero la sincronización, luego el historial.
create trigger lodging_rooms_ops_1_sync before update of status on public.lodging_rooms for each row execute function public.lodging_rooms_sync_operational();
create trigger lodging_rooms_ops_2_event before update on public.lodging_rooms for each row execute function public.lodging_rooms_operational_event();
revoke execute on function public.lodging_rooms_operational_event(),public.lodging_rooms_sync_operational() from public,anon,authenticated;

-- ---------- Utilidades internas ----------
create or replace function public.lodging_ops_can_view(target_company uuid,target_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_access_unit(target_company,target_unit) and (public.has_permission('lodging.housekeeping.view')
  or public.has_permission('lodging.rooms.inspect') or public.has_permission('lodging.operations.view'))
$$;

create or replace function public.lodging_ops_context(v_source text,v_reason text,v_task uuid,v_reservation uuid) returns void language sql security definer set search_path='' as $$
 select set_config('oasis.ops_source',coalesce(v_source,''),true),set_config('oasis.ops_reason',coalesce(v_reason,''),true),
  set_config('oasis.ops_task',coalesce(v_task::text,''),true),set_config('oasis.ops_reservation',coalesce(v_reservation::text,''),true);
$$;
revoke execute on function public.lodging_ops_context(text,text,uuid,uuid) from public,anon,authenticated;

-- Deja la habitación sucia con una tarea de aseo pendiente (sin duplicar la tarea abierta).
create or replace function public.lodging_ops_mark_dirty(v_room public.lodging_rooms,v_origin text,v_reservation uuid,v_attempt integer,v_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_task uuid;
begin
 select id into v_task from public.lodging_housekeeping_tasks where room_id=v_room.id and status in('pending','in_progress');
 if v_task is null then
  insert into public.lodging_housekeeping_tasks(company_id,business_unit_id,room_id,reservation_id,origin,attempt,created_by)
  values(v_room.company_id,v_room.business_unit_id,v_room.id,v_reservation,v_origin,coalesce(v_attempt,1),auth.uid()) returning id into v_task;
 end if;
 perform public.lodging_ops_context(v_origin,v_reason,v_task,v_reservation);
 update public.lodging_rooms set operational_status='dirty',rework=(v_origin='rework') where id=v_room.id;
 return v_task;
end $$;
revoke execute on function public.lodging_ops_mark_dirty(public.lodging_rooms,text,uuid,integer,text) from public,anon,authenticated;

-- ---------- Aseo ----------
create or replace function public.lodging_housekeeping_start(target_room uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_room public.lodging_rooms; v_task public.lodging_housekeeping_tasks; who text;
begin
 if not public.has_permission('lodging.housekeeping.execute') then raise exception 'Sin autorizacion'; end if;
 select * into v_room from public.lodging_rooms where id=target_room for update;
 if v_room.id is null or not public.can_access_unit(v_room.company_id,v_room.business_unit_id) then raise exception 'Habitacion no encontrada'; end if;
 if v_room.operational_status='cleaning' then
  select coalesce(p.first_name,'otra persona') into who from public.lodging_housekeeping_tasks t left join public.profiles p on p.id=t.started_by
  where t.room_id=v_room.id and t.status='in_progress';
  raise exception 'La habitacion ya esta siendo limpiada por %',coalesce(who,'otra persona');
 end if;
 if v_room.operational_status<>'dirty' then raise exception 'La habitacion no esta pendiente de limpieza'; end if;
 select * into v_task from public.lodging_housekeeping_tasks where room_id=v_room.id and status='pending' for update;
 if v_task.id is null then
  insert into public.lodging_housekeeping_tasks(company_id,business_unit_id,room_id,origin,created_by)
  values(v_room.company_id,v_room.business_unit_id,v_room.id,'manual',me) returning * into v_task;
 end if;
 update public.lodging_housekeeping_tasks set status='in_progress',started_by=me,started_at=now() where id=v_task.id;
 perform public.lodging_ops_context('housekeeping',null,v_task.id,v_task.reservation_id);
 update public.lodging_rooms set operational_status='cleaning' where id=v_room.id;
 return v_task.id;
end $$;

-- checklist: objeto {item: true|false}. Solo quien la comenzó, o operación, la finaliza.
create or replace function public.lodging_housekeeping_finish(target_task uuid,checklist jsonb,finish_notes text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_task public.lodging_housekeeping_tasks; v_room public.lodging_rooms;
begin
 if not public.has_permission('lodging.housekeeping.execute') then raise exception 'Sin autorizacion'; end if;
 select * into v_task from public.lodging_housekeeping_tasks where id=target_task for update;
 if v_task.id is null or not public.can_access_unit(v_task.company_id,v_task.business_unit_id) then raise exception 'Tarea no encontrada'; end if;
 if v_task.status<>'in_progress' then raise exception 'La limpieza no esta en curso'; end if;
 if v_task.started_by<>me and not public.has_permission('lodging.operations.view') then raise exception 'Solo quien comenzo la limpieza puede finalizarla'; end if;
 if jsonb_typeof(checklist)<>'object' or checklist='{}'::jsonb then raise exception 'Checklist invalido'; end if;
 select * into v_room from public.lodging_rooms where id=v_task.room_id for update;
 update public.lodging_housekeeping_tasks set status='completed',completed_by=me,completed_at=now(),
  duration_minutes=greatest(0,round(extract(epoch from now()-started_at)/60)),checklist=lodging_housekeeping_finish.checklist,
  notes=nullif(btrim(finish_notes),'')
 where id=v_task.id;
 if v_room.operational_status='cleaning' then
  perform public.lodging_ops_context('housekeeping',null,v_task.id,v_task.reservation_id);
  update public.lodging_rooms set operational_status='pending_inspection' where id=v_room.id;
 end if;
end $$;

-- ---------- Inspección de recepción (100%) ----------
create or replace function public.lodging_room_inspect(target_room uuid,approved boolean,checklist jsonb,reason text,inspection_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_room public.lodging_rooms; v_task public.lodging_housekeeping_tasks; v_id uuid;
begin
 if not public.has_permission('lodging.rooms.inspect') then raise exception 'Sin autorizacion'; end if;
 select * into v_room from public.lodging_rooms where id=target_room for update;
 if v_room.id is null or not public.can_access_unit(v_room.company_id,v_room.business_unit_id) then raise exception 'Habitacion no encontrada'; end if;
 if v_room.operational_status<>'pending_inspection' then raise exception 'La habitacion no esta pendiente de inspeccion'; end if;
 if jsonb_typeof(checklist)<>'object' then raise exception 'Checklist invalido'; end if;
 if not approved and char_length(coalesce(btrim(reason),''))<3 then raise exception 'Indica el motivo del rechazo'; end if;
 -- Última limpieza terminada y aún sin inspección (si la hay; tras mantención puede no existir).
 select t.* into v_task from public.lodging_housekeeping_tasks t
 where t.room_id=v_room.id and t.status='completed' and not exists(select 1 from public.lodging_room_inspections i where i.task_id=t.id)
 order by t.completed_at desc limit 1;
 insert into public.lodging_room_inspections(company_id,business_unit_id,room_id,task_id,result,checklist,rejection_reason,notes,inspector_id)
 values(v_room.company_id,v_room.business_unit_id,v_room.id,v_task.id,case when approved then 'approved' else 'rejected' end,checklist,
  case when approved then null else btrim(reason) end,nullif(btrim(inspection_notes),''),me)
 returning id into v_id;
 if approved then
  perform public.lodging_ops_context('inspection',null,v_task.id,v_task.reservation_id);
  update public.lodging_rooms set operational_status='inspected',rework=false,
   status=case when status='cleaning' then 'available' else status end where id=v_room.id;
 else
  perform public.lodging_ops_mark_dirty(v_room,'rework',v_task.reservation_id,coalesce(v_task.attempt,0)+1,btrim(reason));
 end if;
 return v_id;
end $$;

-- ---------- Check-out y check-in transaccionales ----------
create or replace function public.lodging_check_out(target_reservation uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_res public.lodging_reservations; v_room public.lodging_rooms; v_balance numeric;
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.status<>'checked_in' then raise exception 'La reserva no tiene check-in'; end if;
 select balance into v_balance from public.lodging_payment_summary(v_res.id);
 if coalesce(v_balance,0)>0 then raise exception 'No se puede realizar el check-out con saldo pendiente'; end if;
 update public.lodging_reservations set status='checked_out',actual_check_out=now(),departure_processed_at=now() where id=v_res.id;
 select * into v_room from public.lodging_rooms where id=v_res.room_id for update;
 update public.lodging_rooms set status=case when status in('maintenance','out_of_service') then status else 'cleaning' end where id=v_room.id;
 if v_room.operational_status not in('maintenance','out_of_service') then
  perform public.lodging_ops_mark_dirty(v_room,'checkout',v_res.id,1,null);
 end if;
end $$;

-- override_reason: solo para quien tenga lodging.checkin.override; queda en audit_logs.
create or replace function public.lodging_check_in(target_reservation uuid,override_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_res public.lodging_reservations; v_room public.lodging_rooms;
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.status<>'confirmed' then raise exception 'La reserva no esta confirmada'; end if;
 select * into v_room from public.lodging_rooms where id=v_res.room_id for update;
 if v_room.operational_status<>'inspected' then
  if char_length(coalesce(btrim(override_reason),''))=0 then raise exception 'Esta habitacion todavia no ha sido liberada por inspeccion'; end if;
  if not public.has_permission('lodging.checkin.override') then raise exception 'Sin autorizacion para forzar el check-in'; end if;
  if char_length(btrim(override_reason))<5 then raise exception 'Indica el motivo del check-in forzado'; end if;
  insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
  values(v_res.company_id,v_res.business_unit_id,auth.uid(),'checkin_override','lodging_reservations',v_res.id,
   jsonb_build_object('room_id',v_room.id,'previous_status',v_room.operational_status),
   jsonb_build_object('reason',btrim(override_reason),'reservation_id',v_res.id,'room_id',v_room.id));
 end if;
 update public.lodging_reservations set status='checked_in',actual_check_in=now() where id=v_res.id;
 update public.lodging_rooms set status=case when status in('maintenance','out_of_service') then status else 'occupied' end where id=v_room.id;
end $$;

-- Salidas sin check-out formal (Airbnb/Booking importadas o sin registrar):
-- al pasar la hora de salida la habitación queda sucia. Idempotente.
create or replace function public.lodging_ops_sync_departures(target_unit uuid) returns integer language plpgsql security definer set search_path='' as $$
declare unit public.business_units; cfg public.lodging_ops_settings; r record; v_room public.lodging_rooms; n integer:=0;
 now_local timestamp:=(now() at time zone 'America/Santiago');
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not (public.lodging_ops_can_view(unit.company_id,unit.id) or
   (public.can_access_unit(unit.company_id,unit.id) and public.has_permission('lodging.reservations.view'))) then raise exception 'Unidad no autorizada'; end if;
 select * into cfg from public.lodging_ops_settings where business_unit_id=unit.id;
 for r in select * from public.lodging_reservations
  where business_unit_id=unit.id and departure_processed_at is null and status not in('cancelled','conflict','checked_in')
   and origin<>'maintenance' and check_out>=now_local::date-7
   and (check_out<now_local::date or (check_out=now_local::date and now_local::time>=coalesce(cfg.default_checkout_time,'12:00')))
  for update skip locked loop
  update public.lodging_reservations set departure_processed_at=now() where id=r.id;
  select * into v_room from public.lodging_rooms where id=r.room_id for update;
  if v_room.operational_status='inspected' then
   perform public.lodging_ops_mark_dirty(v_room,'auto_departure',r.id,1,'Salida sin check-out registrado');
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;

-- ---------- Tablero operacional (sin datos financieros ni del huésped) ----------
create or replace function public.lodging_ops_board(target_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units; cfg public.lodging_ops_settings; today date:=(now() at time zone 'America/Santiago')::date; result jsonb;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.lodging_ops_can_view(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 select * into cfg from public.lodging_ops_settings where business_unit_id=unit.id;
 with rooms as (
  select r.* from public.lodging_rooms r where r.business_unit_id=unit.id and r.active
 ), res as (
  select s.* from public.lodging_reservations s where s.business_unit_id=unit.id and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
 )
 select jsonb_build_object(
  'unit',jsonb_build_object('id',unit.id,'code',unit.code,'name',unit.name),
  'today',today,
  'settings',jsonb_build_object('checkin',to_char(coalesce(cfg.default_checkin_time,'14:00'),'HH24:MI'),'checkout',to_char(coalesce(cfg.default_checkout_time,'12:00'),'HH24:MI'),
   'inspection_alert_minutes',coalesce(cfg.inspection_alert_minutes,60),'dirty_alert_minutes',coalesce(cfg.dirty_alert_minutes,120)),
  'arrivals_today',(select count(*) from res where check_in=today and status in('confirmed','pending','review_required')),
  'departures_today',(select count(*) from res where check_out=today),
  'rooms',coalesce((select jsonb_agg(jsonb_build_object(
    'id',rm.id,'name',rm.name,'room_type',rm.room_type,'display_order',rm.display_order,
    'operational_status',rm.operational_status,'rework',rm.rework,'status_changed_at',rm.operational_status_changed_at,
    -- Ocupada: con check-in hecho, o estadía importada (sin check-in formal) que empezó antes de hoy.
    'occupied',exists(select 1 from res where res.room_id=rm.id and (res.status='checked_in'
      or (res.status not in('checked_out') and res.check_in<today and res.check_out>today and res.departure_processed_at is null))),
    'departure_today',exists(select 1 from res where res.room_id=rm.id and res.check_out=today),
    'task',(select jsonb_build_object('id',t.id,'status',t.status,'origin',t.origin,'attempt',t.attempt,'started_at',t.started_at,
      'started_by',t.started_by,'started_by_name',p.first_name)
      from public.lodging_housekeeping_tasks t left join public.profiles p on p.id=t.started_by
      where t.room_id=rm.id and t.status in('pending','in_progress') limit 1),
    'awaiting',(select jsonb_build_object('task_id',t.id,'completed_at',t.completed_at,'completed_by_name',p.first_name,'duration_minutes',t.duration_minutes,'attempt',t.attempt)
      from public.lodging_housekeeping_tasks t left join public.profiles p on p.id=t.completed_by
      where t.room_id=rm.id and t.status='completed' and rm.operational_status='pending_inspection'
       and not exists(select 1 from public.lodging_room_inspections i where i.task_id=t.id) order by t.completed_at desc limit 1),
    'last_rejection',(select jsonb_build_object('reason',i.rejection_reason,'at',i.inspected_at) from public.lodging_room_inspections i
      where i.room_id=rm.id and i.result='rejected' and rm.rework order by i.inspected_at desc limit 1),
    'next_arrival',(select jsonb_build_object('date',n.check_in,'time',to_char(coalesce(n.estimated_arrival,cfg.default_checkin_time,'14:00'),'HH24:MI'),'guests',n.guest_count)
      from res n where n.room_id=rm.id and n.check_in>=today and n.status in('confirmed','pending','review_required') order by n.check_in,n.estimated_arrival nulls last limit 1)
   ) order by rm.display_order,rm.name) from rooms rm),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- ---------- RLS y privilegios ----------
alter table public.lodging_ops_settings enable row level security;
alter table public.lodging_room_status_events enable row level security;
alter table public.lodging_housekeeping_tasks enable row level security;
alter table public.lodging_room_inspections enable row level security;
create policy lodging_ops_settings_select on public.lodging_ops_settings for select to authenticated using(public.lodging_ops_can_view(company_id,business_unit_id));
create policy lodging_room_status_events_select on public.lodging_room_status_events for select to authenticated using(public.lodging_ops_can_view(company_id,business_unit_id));
create policy lodging_housekeeping_tasks_select on public.lodging_housekeeping_tasks for select to authenticated using(public.lodging_ops_can_view(company_id,business_unit_id));
create policy lodging_room_inspections_select on public.lodging_room_inspections for select to authenticated using(public.lodging_ops_can_view(company_id,business_unit_id));

revoke all on public.lodging_ops_settings,public.lodging_room_status_events,public.lodging_housekeeping_tasks,public.lodging_room_inspections from public,anon,authenticated;
grant select on public.lodging_ops_settings,public.lodging_room_status_events,public.lodging_housekeeping_tasks,public.lodging_room_inspections to authenticated;

revoke execute on function public.lodging_ops_can_view(uuid,uuid),public.lodging_housekeeping_start(uuid),public.lodging_housekeeping_finish(uuid,jsonb,text),
 public.lodging_room_inspect(uuid,boolean,jsonb,text,text),public.lodging_check_out(uuid),public.lodging_check_in(uuid,text),
 public.lodging_ops_sync_departures(uuid),public.lodging_ops_board(uuid) from public,anon;
grant execute on function public.lodging_ops_can_view(uuid,uuid),public.lodging_housekeeping_start(uuid),public.lodging_housekeeping_finish(uuid,jsonb,text),
 public.lodging_room_inspect(uuid,boolean,jsonb,text,text),public.lodging_check_out(uuid),public.lodging_check_in(uuid,text),
 public.lodging_ops_sync_departures(uuid),public.lodging_ops_board(uuid) to authenticated;

commit;
