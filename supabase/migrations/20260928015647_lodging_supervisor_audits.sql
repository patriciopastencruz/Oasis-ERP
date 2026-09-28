begin;

-- Fase G: auditoría semanal del supervisor por muestreo (recepción ya
-- inspecciona el 100%). Semana lunes a domingo (America/Santiago).
-- Meta por hostal = máx(mínimo, ⌈limpiezas × %⌉), acotada a las habitaciones
-- distintas limpiadas. La habitación se elige al momento de auditar mediante
-- muestreo ponderado por riesgo con componente aleatorio, sin revelar la
-- muestra por adelantado. Una auditoría aprobada no cambia el estado de la
-- habitación; una fallida exige observación y puede generar nueva limpieza,
-- incidencia o nota administrativa. Nunca sanciona automáticamente.

-- ---------- Parámetros ----------
alter table public.lodging_ops_settings
 alter column audit_sample_pct set default 20,
 add column audit_ok_pct numeric(5,2) not null default 100 check(audit_ok_pct between 0 and 100),
 add column audit_warning_pct numeric(5,2) not null default 80 check(audit_warning_pct between 0 and 100);
update public.lodging_ops_settings set audit_sample_pct=20 where audit_sample_pct=15;

-- Una falla de auditoría puede pedir nueva limpieza.
alter table public.lodging_housekeeping_tasks drop constraint lodging_housekeeping_tasks_origin_check;
alter table public.lodging_housekeeping_tasks add constraint lodging_housekeeping_tasks_origin_check
 check(origin in('checkout','auto_departure','rework','maintenance','manual','audit'));

-- ---------- Incidencias (base; la fase E agrega su gestión) ----------
create table public.lodging_incidents(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_id uuid references public.lodging_rooms(id),
 source text not null default 'manual' check(source in('housekeeping','reception','audit','facility_audit','manual')),
 category text not null check(category in('bano','agua_caliente','electricidad','tv','wifi','cerradura','mobiliario','ventana','limpieza','ropa_cama','plomeria','otro')),
 description text not null check(char_length(btrim(description)) between 3 and 1000),
 priority text not null default 'medium' check(priority in('low','medium','high','critical')),
 status text not null default 'open' check(status in('open','assigned','in_progress','resolved','cancelled')),
 reported_by uuid not null references public.profiles(id),
 assigned_to uuid references public.profiles(id),
 audit_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),
 resolved_at timestamptz,resolved_by uuid references public.profiles(id),resolution_notes text,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_incidents_unit_idx on public.lodging_incidents(company_id,business_unit_id,status,created_at desc);
create index lodging_incidents_room_idx on public.lodging_incidents(room_id,created_at desc);
create trigger lodging_incidents_updated_at before update on public.lodging_incidents for each row execute function public.set_updated_at();
create trigger audit_lodging_incidents after insert or update or delete on public.lodging_incidents for each row execute function public.audit_row_change();

-- ---------- Auditorías del supervisor ----------
create table public.lodging_supervisor_audits(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_id uuid not null references public.lodging_rooms(id),
 week_start date not null check(extract(isodow from week_start)=1),
 status text not null default 'in_progress' check(status in('in_progress','passed','failed','skipped')),
 housekeeping_task_id uuid references public.lodging_housekeeping_tasks(id),
 inspection_id uuid references public.lodging_room_inspections(id),
 housekeeper_id uuid references public.profiles(id),
 inspector_id uuid references public.profiles(id),
 supervisor_id uuid not null references public.profiles(id),
 selection_score numeric(8,3),
 selection_factors jsonb,
 selected_at timestamptz not null default clock_timestamp(),
 audited_at timestamptz,
 checklist jsonb,
 notes text check(notes is null or char_length(notes)<=1000),
 responsibility text check(responsibility is null or responsibility in('housekeeping','reception','technical','new_issue')),
 failure_category text check(failure_category is null or failure_category in('bano','agua_caliente','electricidad','tv','wifi','cerradura','mobiliario','ventana','limpieza','ropa_cama','plomeria','otro')),
 severity text check(severity is null or severity in('low','medium','high','critical')),
 action text check(action is null or action in('none','reclean','incident','admin_note')),
 reclean_task_id uuid references public.lodging_housekeeping_tasks(id),
 incident_id uuid references public.lodging_incidents(id),
 skip_reason text,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(status<>'failed' or (char_length(coalesce(btrim(notes),''))>=3 and responsibility is not null and failure_category is not null and severity is not null and action is not null)),
 check(status<>'skipped' or char_length(coalesce(btrim(skip_reason),''))>=3),
 check(status='in_progress' or status='skipped' or audited_at is not null)
);
-- Sin auditorías duplicadas: una habitación una vez por semana y una auditoría abierta por supervisor y hostal.
create unique index lodging_supervisor_audits_room_week_idx on public.lodging_supervisor_audits(room_id,week_start) where status in('in_progress','passed','failed');
create unique index lodging_supervisor_audits_open_idx on public.lodging_supervisor_audits(supervisor_id,business_unit_id) where status='in_progress';
create index lodging_supervisor_audits_unit_week_idx on public.lodging_supervisor_audits(company_id,business_unit_id,week_start);
create index lodging_supervisor_audits_room_idx on public.lodging_supervisor_audits(room_id,audited_at desc);
create trigger audit_lodging_supervisor_audits after insert or update or delete on public.lodging_supervisor_audits for each row execute function public.audit_row_change();
alter table public.lodging_incidents add constraint lodging_incidents_audit_fk foreign key(audit_id) references public.lodging_supervisor_audits(id);

-- ---------- Utilidades ----------
create or replace function public.lodging_week_start(v_day date) returns date language sql immutable set search_path='' as $$
 select (v_day - (extract(isodow from v_day)::int - 1))::date
$$;

create or replace function public.lodging_audit_can_view(target_company uuid,target_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_access_unit(target_company,target_unit) and (public.has_permission('lodging.audits.view') or public.has_permission('lodging.audits.execute'))
$$;

-- Meta de auditorías de la semana para un hostal.
create or replace function public.lodging_audit_target(target_unit uuid,v_week date) returns jsonb language sql stable security definer set search_path='' as $$
 with cfg as (select coalesce(s.audit_sample_pct,20) pct,coalesce(s.audit_min_per_week,3) minimum from public.business_units bu
   left join public.lodging_ops_settings s on s.business_unit_id=bu.id where bu.id=target_unit),
 cleaned as (select count(*)::int n,count(distinct t.room_id)::int rooms from public.lodging_housekeeping_tasks t
   join public.lodging_rooms r on r.id=t.room_id and r.active
   where t.business_unit_id=target_unit and t.status='completed'
    and (t.completed_at at time zone 'America/Santiago')::date between v_week and v_week+6)
 select jsonb_build_object('cleaned',c.n,'cleaned_rooms',c.rooms,'pct',cfg.pct,'minimum',cfg.minimum,
  'target',least(greatest(cfg.minimum,ceil(c.n*cfg.pct/100.0)::int),c.rooms))
 from cleaned c,cfg
$$;
revoke execute on function public.lodging_audit_target(uuid,date) from public,anon,authenticated;

-- Candidatas a auditoría y su puntaje de riesgo (uso interno de la selección).
create or replace function public.lodging_audit_candidates(target_unit uuid) returns table(room_id uuid,room_name text,task_id uuid,inspection_id uuid,housekeeper_id uuid,inspector_id uuid,score numeric,factors jsonb)
language sql stable security definer set search_path='' as $$
 with d as (select (now() at time zone 'America/Santiago')::date as today),
 w as (select public.lodging_week_start(today) as week_start,today from d),
 last_task as (
  select distinct on (t.room_id) t.* from public.lodging_housekeeping_tasks t
  where t.business_unit_id=target_unit and t.status='completed' and t.completed_at>=now()-interval '7 days'
  order by t.room_id,t.completed_at desc
 ), eligible as (
  select r.id as room_id,r.name as room_name,lt.id as task_id,lt.attempt,lt.completed_by,i.id as inspection_id,i.inspector_id
  from public.lodging_rooms r join last_task lt on lt.room_id=r.id
  join public.lodging_room_inspections i on i.task_id=lt.id and i.result='approved'
  cross join w
  where r.business_unit_id=target_unit and r.active and r.operational_status='inspected'
   -- No interrumpir huéspedes: fuera las habitaciones ocupadas.
   and not exists(select 1 from public.lodging_reservations s where s.room_id=r.id and s.status not in('cancelled','conflict','checked_out')
     and s.origin<>'maintenance' and (s.status='checked_in' or (s.check_in<w.today and s.check_out>w.today and s.departure_processed_at is null)))
   and not exists(select 1 from public.lodging_supervisor_audits a where a.room_id=r.id and a.week_start=w.week_start and a.status in('in_progress','passed','failed'))
 ), scored as (
  select e.*,
   exists(select 1 from public.lodging_room_inspections x where x.room_id=e.room_id and x.result='rejected' and x.inspected_at>=now()-interval '30 days') as rejected_recent,
   e.attempt>1 as rework,
   (select count(*) from public.lodging_incidents x where x.room_id=e.room_id and x.created_at>=now()-interval '60 days')::int as incidents,
   exists(select 1 from public.lodging_room_status_events x where x.room_id=e.room_id and x.to_status in('maintenance','out_of_service') and x.created_at>=now()-interval '30 days') as maintenance_recent,
   least(4,coalesce((select floor(((now() at time zone 'America/Santiago')::date-max((a.audited_at at time zone 'America/Santiago')::date))/7.0)
     from public.lodging_supervisor_audits a where a.room_id=e.room_id and a.status in('passed','failed')),4))::int as weeks_since_audit,
   coalesce((select avg(case when x.result='rejected' then 1.0 else 0 end) from public.lodging_room_inspections x
     join public.lodging_housekeeping_tasks t on t.id=x.task_id
     where t.completed_by=e.completed_by and x.inspected_at>=now()-interval '30 days'),0) as housekeeper_reject_rate,
   coalesce((select avg(case when a.status='failed' then 1.0 else 0 end) from public.lodging_supervisor_audits a
     where a.inspector_id=e.inspector_id and a.status in('passed','failed') and a.audited_at>=now()-interval '60 days'),0) as inspector_fail_rate,
   exists(select 1 from public.lodging_reservations s cross join d where s.room_id=e.room_id and s.status in('confirmed','pending','review_required')
     and s.check_in between d.today and d.today+1) as arrival_soon
  from eligible e
 )
 select s.room_id,s.room_name,s.task_id,s.inspection_id,s.completed_by,s.inspector_id,
  (1 + 2*s.rejected_recent::int + 1.5*s.rework::int + least(s.incidents,3) + 1.5*s.maintenance_recent::int + 0.5*s.weeks_since_audit
   + 3*s.housekeeper_reject_rate + 3*s.inspector_fail_rate + 0.5*s.arrival_soon::int)::numeric(8,3),
  jsonb_build_object('rejected_recent',s.rejected_recent,'rework',s.rework,'incidents',s.incidents,'maintenance_recent',s.maintenance_recent,
   'weeks_since_audit',s.weeks_since_audit,'housekeeper_reject_rate',round(s.housekeeper_reject_rate,2),'inspector_fail_rate',round(s.inspector_fail_rate,2),
   'arrival_soon',s.arrival_soon,'complaints',0)
 from scored s
$$;
revoke execute on function public.lodging_audit_candidates(uuid) from public,anon,authenticated;

-- ---------- Realizar auditoría: elige la habitación en el momento ----------
-- Si el supervisor ya tiene una auditoría abierta en el hostal, la devuelve
-- (no se puede "volver a sortear" para evitar habitaciones difíciles).
create or replace function public.lodging_audit_draw(target_unit uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; existing uuid; pick record; new_id uuid;
begin
 if not public.has_permission('lodging.audits.execute') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 -- Serializa la selección del hostal para no elegir la misma habitación en paralelo.
 perform pg_advisory_xact_lock(hashtext('lodging_audit_draw:'||unit.id::text));
 select id into existing from public.lodging_supervisor_audits where supervisor_id=me and business_unit_id=unit.id and status='in_progress';
 if existing is not null then return existing; end if;
 -- Muestreo ponderado (Efraimidis–Spirakis): más riesgo = más probabilidad, siempre con azar.
 select c.* into pick from public.lodging_audit_candidates(unit.id) c
 order by -ln(greatest(random(),1e-12))/c.score limit 1;
 if pick.room_id is null then raise exception 'No hay habitaciones auditables ahora'; end if;
 insert into public.lodging_supervisor_audits(company_id,business_unit_id,room_id,week_start,housekeeping_task_id,inspection_id,housekeeper_id,inspector_id,supervisor_id,selection_score,selection_factors)
 values(unit.company_id,unit.id,pick.room_id,public.lodging_week_start((now() at time zone 'America/Santiago')::date),pick.task_id,pick.inspection_id,
  pick.housekeeper_id,pick.inspector_id,me,pick.score,pick.factors)
 returning id into new_id;
 return new_id;
end $$;

-- Habitación no disponible (p. ej. ya la ocupó un huésped): se descarta con motivo.
create or replace function public.lodging_audit_skip(target_audit uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.lodging_supervisor_audits;
begin
 if not public.has_permission('lodging.audits.execute') then raise exception 'Sin autorizacion'; end if;
 select * into a from public.lodging_supervisor_audits where id=target_audit for update;
 if a.id is null or not public.can_access_unit(a.company_id,a.business_unit_id) then raise exception 'Auditoria no encontrada'; end if;
 if a.status<>'in_progress' then raise exception 'La auditoria ya fue cerrada'; end if;
 if a.supervisor_id<>auth.uid() then raise exception 'Solo el supervisor que la inicio puede descartarla'; end if;
 if char_length(coalesce(btrim(reason),''))<3 then raise exception 'Indica el motivo'; end if;
 update public.lodging_supervisor_audits set status='skipped',skip_reason=btrim(reason) where id=a.id;
end $$;

-- checklist: {item: 'ok'|'observation'|'fail'}. Cualquier 'fail' = auditoría fallida.
create or replace function public.lodging_audit_submit(target_audit uuid,checklist jsonb,audit_notes text,v_responsibility text,v_category text,v_severity text,v_action text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); a public.lodging_supervisor_audits; v_room public.lodging_rooms; failed boolean; bad text; v_task uuid; v_incident uuid;
begin
 if not public.has_permission('lodging.audits.execute') then raise exception 'Sin autorizacion'; end if;
 select * into a from public.lodging_supervisor_audits where id=target_audit for update;
 if a.id is null or not public.can_access_unit(a.company_id,a.business_unit_id) then raise exception 'Auditoria no encontrada'; end if;
 if a.status<>'in_progress' then raise exception 'La auditoria ya fue cerrada'; end if;
 if a.supervisor_id<>me then raise exception 'Solo el supervisor que la inicio puede cerrarla'; end if;
 if jsonb_typeof(checklist)<>'object' or checklist='{}'::jsonb then raise exception 'Checklist invalido'; end if;
 select key into bad from jsonb_each_text(checklist) where value not in('ok','observation','fail') limit 1;
 if bad is not null then raise exception 'Checklist invalido'; end if;
 failed:=exists(select 1 from jsonb_each_text(checklist) where value='fail');
 if not failed then
  update public.lodging_supervisor_audits set status='passed',audited_at=clock_timestamp(),checklist=lodging_audit_submit.checklist,
   notes=nullif(btrim(audit_notes),'') where id=a.id;
  return;
 end if;
 if char_length(coalesce(btrim(audit_notes),''))<3 then raise exception 'La observacion es obligatoria cuando la auditoria falla'; end if;
 if v_responsibility not in('housekeeping','reception','technical','new_issue') then raise exception 'Indica el origen de la falla'; end if;
 if v_category not in('bano','agua_caliente','electricidad','tv','wifi','cerradura','mobiliario','ventana','limpieza','ropa_cama','plomeria','otro') then raise exception 'Indica la categoria'; end if;
 if v_severity not in('low','medium','high','critical') then raise exception 'Indica la gravedad'; end if;
 if v_action not in('none','reclean','incident','admin_note') then raise exception 'Indica la accion'; end if;
 select * into v_room from public.lodging_rooms where id=a.room_id for update;
 if v_action='reclean' and v_room.operational_status in('inspected','pending_inspection') then
  v_task:=public.lodging_ops_mark_dirty(v_room,'audit',null,1,'Auditoria fallida: '||btrim(audit_notes));
 elsif v_action='incident' then
  insert into public.lodging_incidents(company_id,business_unit_id,room_id,source,category,description,priority,reported_by,audit_id)
  values(a.company_id,a.business_unit_id,a.room_id,'audit',v_category,btrim(audit_notes),v_severity,me,a.id) returning id into v_incident;
 end if;
 update public.lodging_supervisor_audits set status='failed',audited_at=clock_timestamp(),checklist=lodging_audit_submit.checklist,
  notes=btrim(audit_notes),responsibility=v_responsibility,failure_category=v_category,severity=v_severity,action=v_action,
  reclean_task_id=v_task,incident_id=v_incident
 where id=a.id;
end $$;

-- ---------- Resumen semanal de todos los hostales asignados ----------
create or replace function public.lodging_audit_week_summary(target_week date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_week date:=public.lodging_week_start(coalesce(target_week,(now() at time zone 'America/Santiago')::date)); result jsonb;
begin
 if not (public.has_permission('lodging.audits.view') or public.has_permission('lodging.audits.execute')) then raise exception 'Sin autorizacion'; end if;
 with units as (
  select bu.* from public.business_units bu join public.user_business_units ubu on ubu.business_unit_id=bu.id and ubu.user_id=me
  where bu.code in('HU','HOC','HOB') and bu.deleted_at is null and public.can_access_unit(bu.company_id,bu.id)
 ), rows as (
  select u.id,u.code,u.name,public.lodging_audit_target(u.id,v_week) as t,
   coalesce(s.audit_ok_pct,100) ok_pct,coalesce(s.audit_warning_pct,80) warning_pct,
   (select count(*) from public.lodging_supervisor_audits a where a.business_unit_id=u.id and a.week_start=v_week and a.status='passed')::int passed,
   (select count(*) from public.lodging_supervisor_audits a where a.business_unit_id=u.id and a.week_start=v_week and a.status='failed')::int failed,
   (select count(*) from public.lodging_supervisor_audits a where a.business_unit_id=u.id and a.week_start=v_week and a.status='skipped')::int skipped,
   (select count(*) from public.lodging_supervisor_audits a, jsonb_each_text(coalesce(a.checklist,'{}'::jsonb)) c
     where a.business_unit_id=u.id and a.week_start=v_week and a.status in('passed','failed') and c.value in('observation','fail'))::int findings,
   (select count(*) from public.lodging_incidents i join public.lodging_supervisor_audits a on a.id=i.audit_id where a.business_unit_id=u.id and a.week_start=v_week)::int incidents,
   (select a.id from public.lodging_supervisor_audits a where a.business_unit_id=u.id and a.supervisor_id=me and a.status='in_progress' limit 1) open_audit
  from units u left join public.lodging_ops_settings s on s.business_unit_id=u.id
 )
 select jsonb_build_object('week_start',v_week,'week_end',v_week+6,'units',coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'code',r.code,'name',r.name,'cleaned',(r.t->>'cleaned')::int,'target',(r.t->>'target')::int,
   'passed',r.passed,'failed',r.failed,'done',r.passed+r.failed,'skipped',r.skipped,'pending',greatest((r.t->>'target')::int-(r.passed+r.failed),0),
   'compliance',case when (r.t->>'target')::int=0 then 100 else round(100.0*(r.passed+r.failed)/(r.t->>'target')::int,1) end,
   'conformity',case when r.passed+r.failed=0 then null else round(100.0*r.passed/(r.passed+r.failed),1) end,
   'findings',r.findings,'incidents',r.incidents,'ok_pct',r.ok_pct,'warning_pct',r.warning_pct,'open_audit',r.open_audit
  ) order by r.name),'[]'::jsonb)) into result from rows r;
 return result;
end $$;

-- ---------- Datos de una auditoría abierta o cerrada (sin reservas ni finanzas) ----------
create or replace function public.lodging_audit_detail(target_audit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.lodging_supervisor_audits; result jsonb;
begin
 select * into a from public.lodging_supervisor_audits where id=target_audit;
 if a.id is null or not public.lodging_audit_can_view(a.company_id,a.business_unit_id) then raise exception 'Auditoria no encontrada'; end if;
 select jsonb_build_object('id',a.id,'status',a.status,'unit_id',a.business_unit_id,'room_id',a.room_id,'room_name',r.name,'room_type',r.room_type,
  'operational_status',r.operational_status,'week_start',a.week_start,'selected_at',a.selected_at,'audited_at',a.audited_at,
  'supervisor_id',a.supervisor_id,'housekeeper',hk.first_name||' '||hk.last_name,'inspector',ins.first_name||' '||ins.last_name,
  'cleaned_at',t.completed_at,'duration_minutes',t.duration_minutes,'inspected_at',i.inspected_at,
  'checklist',a.checklist,'notes',a.notes,'responsibility',a.responsibility,'failure_category',a.failure_category,'severity',a.severity,'action',a.action,
  'occupied_now',exists(select 1 from public.lodging_reservations s where s.room_id=a.room_id and s.status='checked_in'))
 into result
 from public.lodging_rooms r
 left join public.profiles hk on hk.id=a.housekeeper_id left join public.profiles ins on ins.id=a.inspector_id
 left join public.lodging_housekeeping_tasks t on t.id=a.housekeeping_task_id left join public.lodging_room_inspections i on i.id=a.inspection_id
 where r.id=a.room_id;
 return result;
end $$;

-- ---------- Histórico por habitación: limpiezas, inspecciones y auditorías ----------
create or replace function public.lodging_room_history(target_room uuid,max_items integer default 60) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_room public.lodging_rooms; result jsonb;
begin
 select * into v_room from public.lodging_rooms where id=target_room;
 if v_room.id is null or not (public.lodging_audit_can_view(v_room.company_id,v_room.business_unit_id)
   or (public.can_access_unit(v_room.company_id,v_room.business_unit_id) and public.has_permission('lodging.operations.view'))) then raise exception 'Habitacion no encontrada'; end if;
 with items as (
  select t.completed_at as at,'cleaning' as kind,jsonb_build_object('by',p.first_name||' '||p.last_name,'minutes',t.duration_minutes,'attempt',t.attempt,'origin',t.origin) as data
  from public.lodging_housekeeping_tasks t left join public.profiles p on p.id=t.completed_by where t.room_id=v_room.id and t.status='completed'
  union all
  select i.inspected_at,'inspection',jsonb_build_object('by',p.first_name||' '||p.last_name,'result',i.result,'reason',i.rejection_reason)
  from public.lodging_room_inspections i left join public.profiles p on p.id=i.inspector_id where i.room_id=v_room.id
  union all
  select a.audited_at,'audit',jsonb_build_object('by',p.first_name||' '||p.last_name,'result',a.status,'notes',a.notes,'category',a.failure_category,
   'responsibility',a.responsibility,'action',a.action,'week',to_char(a.week_start,'IYYY-"S"IW'))
  from public.lodging_supervisor_audits a left join public.profiles p on p.id=a.supervisor_id where a.room_id=v_room.id and a.status in('passed','failed')
  union all
  select i.created_at,'incident',jsonb_build_object('category',i.category,'priority',i.priority,'status',i.status,'description',i.description)
  from public.lodging_incidents i where i.room_id=v_room.id
 )
 select jsonb_build_object('room',jsonb_build_object('id',v_room.id,'name',v_room.name,'room_type',v_room.room_type,'operational_status',v_room.operational_status),
  'items',coalesce((select jsonb_agg(jsonb_build_object('at',x.at,'kind',x.kind,'data',x.data) order by x.at desc)
   from (select * from items order by at desc limit greatest(1,least(max_items,200))) x),'[]'::jsonb))
 into result;
 return result;
end $$;

-- ---------- Indicadores del mes y alertas de supervisión ----------
create or replace function public.lodging_audit_month_kpis(target_unit uuid,target_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units; m date:=date_trunc('month',target_month)::date; result jsonb;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.lodging_audit_can_view(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 with au as (
  select a.*,r.name as room_name from public.lodging_supervisor_audits a join public.lodging_rooms r on r.id=a.room_id
  where a.business_unit_id=unit.id and a.status in('passed','failed')
   and (a.audited_at at time zone 'America/Santiago')::date>=m and (a.audited_at at time zone 'America/Santiago')::date<(m+interval '1 month')::date
 ), prev as (
  select a.failure_category from public.lodging_supervisor_audits a
  where a.business_unit_id=unit.id and a.status='failed'
   and (a.audited_at at time zone 'America/Santiago')::date>=(m-interval '1 month')::date and (a.audited_at at time zone 'America/Santiago')::date<m
 )
 select jsonb_build_object(
  'month',m,'audits',(select count(*) from au),'passed',(select count(*) from au where status='passed'),'failed',(select count(*) from au where status='failed'),
  'passed_pct',(select case when count(*)=0 then null else round(100.0*count(*) filter(where status='passed')/count(*),1) end from au),
  'failed_pct',(select case when count(*)=0 then null else round(100.0*count(*) filter(where status='failed')/count(*),1) end from au),
  -- Discrepancia recepción vs supervisor: habitaciones aprobadas por recepción que fallaron en auditoría.
  'reception_discrepancy',(select count(*) from au where status='failed' and inspection_id is not null and responsibility in('housekeeping','reception')),
  'by_responsibility',coalesce((select jsonb_object_agg(responsibility,n) from (select responsibility,count(*) n from au where status='failed' group by 1) x),'{}'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('category',failure_category,'count',n,'previous',(select count(*) from prev where prev.failure_category=x.failure_category)) order by n desc)
   from (select failure_category,count(*) n from au where status='failed' group by 1) x),'[]'::jsonb),
  'rooms',coalesce((select jsonb_agg(jsonb_build_object('room_id',room_id,'room',room_name,'failed',n) order by n desc,room_name)
   from (select room_id,room_name,count(*) n from au where status='failed' group by 1,2) x),'[]'::jsonb),
  -- Reincidencia: habitaciones con 2 o más auditorías fallidas en los últimos 60 días.
  'recurrent',coalesce((select jsonb_agg(jsonb_build_object('room_id',x.room_id,'room',r.name,'failed',x.n) order by x.n desc)
   from (select room_id,count(*) n from public.lodging_supervisor_audits where business_unit_id=unit.id and status='failed' and audited_at>=now()-interval '60 days' group by 1 having count(*)>=2) x
   join public.lodging_rooms r on r.id=x.room_id),'[]'::jsonb),
  'reworks',(select count(*) from public.lodging_housekeeping_tasks t where t.business_unit_id=unit.id and t.origin='rework'
   and (t.created_at at time zone 'America/Santiago')::date>=m and (t.created_at at time zone 'America/Santiago')::date<(m+interval '1 month')::date),
  'inspections_rejected',(select count(*) from public.lodging_room_inspections i where i.business_unit_id=unit.id and i.result='rejected'
   and (i.inspected_at at time zone 'America/Santiago')::date>=m and (i.inspected_at at time zone 'America/Santiago')::date<(m+interval '1 month')::date),
  'inspections_total',(select count(*) from public.lodging_room_inspections i where i.business_unit_id=unit.id
   and (i.inspected_at at time zone 'America/Santiago')::date>=m and (i.inspected_at at time zone 'America/Santiago')::date<(m+interval '1 month')::date),
  'recent',coalesce((select jsonb_agg(jsonb_build_object('id',id,'room_id',room_id,'room',room_name,'status',status,'at',audited_at,'category',failure_category,'responsibility',responsibility,'action',action) order by audited_at desc)
   from (select * from au order by audited_at desc limit 20) x),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- ---------- RLS y privilegios ----------
alter table public.lodging_incidents enable row level security;
alter table public.lodging_supervisor_audits enable row level security;
create policy lodging_incidents_select on public.lodging_incidents for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (public.has_permission('lodging.maintenance.view') or public.has_permission('lodging.operations.view')
  or public.has_permission('lodging.audits.view')));
create policy lodging_supervisor_audits_select on public.lodging_supervisor_audits for select to authenticated using(public.lodging_audit_can_view(company_id,business_unit_id));
revoke all on public.lodging_incidents,public.lodging_supervisor_audits from public,anon,authenticated;
grant select on public.lodging_incidents,public.lodging_supervisor_audits to authenticated;

revoke execute on function public.lodging_audit_can_view(uuid,uuid),public.lodging_audit_draw(uuid),public.lodging_audit_skip(uuid,text),
 public.lodging_audit_submit(uuid,jsonb,text,text,text,text,text),public.lodging_audit_week_summary(date),public.lodging_audit_detail(uuid),
 public.lodging_room_history(uuid,integer),public.lodging_audit_month_kpis(uuid,date) from public,anon;
grant execute on function public.lodging_week_start(date),public.lodging_audit_can_view(uuid,uuid),public.lodging_audit_draw(uuid),public.lodging_audit_skip(uuid,text),
 public.lodging_audit_submit(uuid,jsonb,text,text,text,text,text),public.lodging_audit_week_summary(date),public.lodging_audit_detail(uuid),
 public.lodging_room_history(uuid,integer),public.lodging_audit_month_kpis(uuid,date) to authenticated;

commit;
