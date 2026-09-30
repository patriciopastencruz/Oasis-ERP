begin;

-- Vista ejecutiva de la operación (fase H): tiempos de aseo por habitación y
-- por persona, retrabajos, rechazos y espera de inspección en un período.
-- Solo gerencia y administración (lodging.operations.kpis): incluye el
-- desempeño del personal, que es para mejorar el proceso, no para sancionar.

insert into public.permissions(key,module,description) values
 ('lodging.operations.kpis','lodging','Ver la vista ejecutiva de la operación de hostales (tiempos de aseo e inspección por habitación y persona)')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.operations.kpis' and r.key in('administrator','superadmin','general_manager','lodging_supervisor')
on conflict do nothing;

-- Índices para filtrar por período.
create index if not exists lodging_housekeeping_tasks_completed_idx on public.lodging_housekeeping_tasks(business_unit_id,completed_at) where status='completed';
create index if not exists lodging_room_inspections_unit_time_idx on public.lodging_room_inspections(business_unit_id,inspected_at);

create or replace function public.lodging_ops_kpis(target_unit uuid,from_date date,to_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units; t0 timestamptz; t1 timestamptz; v_result jsonb;
begin
 if not public.has_permission('lodging.operations.kpis') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if from_date is null or to_date is null or to_date<from_date or to_date-from_date>370 then raise exception 'Periodo invalido'; end if;
 -- Período en hora de Santiago, fechas inclusivas.
 t0:=from_date::timestamp at time zone 'America/Santiago';
 t1:=(to_date+1)::timestamp at time zone 'America/Santiago';
 with tasks as (
  select t.*, (select i.result from public.lodging_room_inspections i where i.task_id=t.id order by i.inspected_at limit 1) as first_result,
   (select i.inspected_at from public.lodging_room_inspections i where i.task_id=t.id order by i.inspected_at limit 1) as inspected_at
  from public.lodging_housekeeping_tasks t
  where t.business_unit_id=unit.id and t.status='completed' and t.completed_at>=t0 and t.completed_at<t1
 ), insp as (
  select i.* from public.lodging_room_inspections i where i.business_unit_id=unit.id and i.inspected_at>=t0 and i.inspected_at<t1
 )
 select jsonb_build_object(
  'unit',jsonb_build_object('id',unit.id,'code',unit.code,'name',unit.name),
  'from',from_date,'to',to_date,
  'totals',(select jsonb_build_object(
     'cleanings',count(*),
     'avg_minutes',round(avg(duration_minutes)::numeric,0),
     'max_minutes',max(duration_minutes),
     'rework',count(*) filter(where attempt>1 or origin='audit'),
     'inspected',count(*) filter(where first_result is not null),
     'approved_first',count(*) filter(where first_result='approved' and attempt=1),
     'first_attempt',count(*) filter(where attempt=1 and first_result is not null),
     'avg_wait_minutes',round(avg(extract(epoch from inspected_at-completed_at)/60) filter(where inspected_at is not null)::numeric,0)
    ) from tasks),
  'inspections',(select jsonb_build_object('total',count(*),'approved',count(*) filter(where result='approved'),'rejected',count(*) filter(where result='rejected')) from insp),
  'rejection_reasons',coalesce((select jsonb_agg(x order by x.n desc) from (select rejection_reason as reason,count(*) n from insp where result='rejected' and rejection_reason is not null group by 1) x),'[]'::jsonb),
  'by_room',coalesce((select jsonb_agg(x order by x.display_order,x.name) from (
     select r.id,r.name,r.display_order,count(t.id) cleanings,round(avg(t.duration_minutes)::numeric,0) avg_minutes,max(t.duration_minutes) max_minutes,
      count(t.id) filter(where t.attempt>1 or t.origin='audit') rework,count(t.id) filter(where t.first_result='rejected') rejected,
      max(t.completed_at) last_cleaned_at,
      (select t2.duration_minutes from tasks t2 where t2.room_id=r.id order by t2.completed_at desc limit 1) last_minutes
     from public.lodging_rooms r left join tasks t on t.room_id=r.id
     where r.business_unit_id=unit.id and r.active group by r.id,r.name,r.display_order) x),'[]'::jsonb),
  'by_person',coalesce((select jsonb_agg(x order by x.cleanings desc) from (
     select p.id,p.first_name||' '||p.last_name as name,count(t.id) cleanings,round(avg(t.duration_minutes)::numeric,0) avg_minutes,
      count(t.id) filter(where t.first_result='rejected') rejected,count(t.id) filter(where t.first_result is not null) inspected
     from tasks t join public.profiles p on p.id=coalesce(t.completed_by,t.started_by) group by p.id,p.first_name,p.last_name) x),'[]'::jsonb),
  'by_inspector',coalesce((select jsonb_agg(x order by x.inspections desc) from (
     select p.id,p.first_name||' '||p.last_name as name,count(*) inspections,count(*) filter(where i.result='rejected') rejected
     from insp i join public.profiles p on p.id=i.inspector_id group by p.id,p.first_name,p.last_name) x),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;
revoke execute on function public.lodging_ops_kpis(uuid,date,date) from public,anon;
grant execute on function public.lodging_ops_kpis(uuid,date,date) to authenticated;

commit;
