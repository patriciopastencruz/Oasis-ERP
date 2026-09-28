begin;
-- Fase E: incidencias y mantención del portal operativo.
-- Aseo y recepción reportan problemas (con fotos opcionales en Storage
-- privado). Si afectan la habitabilidad la habitación se bloquea
-- (mantención; fuera de servicio solo administración). Al resolver o cancelar
-- la última incidencia que la bloqueaba, la habitación vuelve a
-- pending_inspection (nunca disponible directo) y recepción la inspecciona.

alter table public.lodging_incidents
 add column blocks_room text check(blocks_room is null or blocks_room in('maintenance','out_of_service')),
 add column room_blocked_at timestamptz,
 add column room_released_at timestamptz,
 add column assigned_at timestamptz,
 add column started_at timestamptz,
 add column cancel_reason text,
 add constraint lodging_incidents_block_room_check check(blocks_room is null or room_id is not null),
 add constraint lodging_incidents_resolution_check check(status<>'resolved' or char_length(coalesce(btrim(resolution_notes),''))>=3),
 add constraint lodging_incidents_cancel_check check(status<>'cancelled' or char_length(coalesce(btrim(cancel_reason),''))>=3);
create index lodging_incidents_blocking_idx on public.lodging_incidents(room_id) where blocks_room is not null and room_released_at is null;
create table public.lodging_incident_attachments(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 incident_id uuid not null references public.lodging_incidents(id),
 object_path text not null unique,
 original_name text not null check(char_length(original_name)<=200),
 mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_incident_attachments_incident_idx on public.lodging_incident_attachments(incident_id) where deleted_at is null;
create index lodging_incident_attachments_unit_idx on public.lodging_incident_attachments(company_id,business_unit_id);
create trigger audit_lodging_incident_attachments after insert or update or delete on public.lodging_incident_attachments for each row execute function public.audit_row_change();
-- ---------- Permisos ----------
create or replace function public.lodging_incident_can_view(target_company uuid,target_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_access_unit(target_company,target_unit) and (public.has_permission('lodging.maintenance.view') or public.has_permission('lodging.maintenance.manage')
  or public.has_permission('lodging.operations.view') or public.has_permission('lodging.audits.view'))
$$;
create or replace function public.lodging_incident_can_report() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('lodging.housekeeping.execute') or public.has_permission('lodging.rooms.inspect') or public.has_permission('lodging.maintenance.view')
  or public.has_permission('lodging.maintenance.manage') or public.has_permission('lodging.operations.view') or public.has_permission('lodging.audits.execute')
$$;
-- ---------- Bloqueo y liberación de la habitación ----------
create or replace function public.lodging_incident_block_room(v_incident public.lodging_incidents,v_kind text) returns void language plpgsql security definer set search_path='' as $$
declare v_room public.lodging_rooms;
begin
 select * into v_room from public.lodging_rooms where id=v_incident.room_id for update;
 perform public.lodging_ops_context('maintenance','Incidencia: '||left(v_incident.description,120),null,null);
 -- Fuera de servicio prevalece sobre mantención; nunca se rebaja un bloqueo mayor.
 if v_kind='out_of_service' or v_room.status<>'out_of_service' then
  update public.lodging_rooms set status=v_kind where id=v_room.id;
 end if;
 update public.lodging_incidents set blocks_room=v_kind,room_blocked_at=coalesce(room_blocked_at,now()),room_released_at=null where id=v_incident.id;
end $$;
-- Libera la habitación solo si no queda otra incidencia abierta que la bloquee.
create or replace function public.lodging_incident_release_room(v_incident public.lodging_incidents) returns boolean language plpgsql security definer set search_path='' as $$
declare v_room public.lodging_rooms; remaining text;
begin
 if v_incident.blocks_room is null or v_incident.room_released_at is not null then return false; end if;
 update public.lodging_incidents set room_released_at=now() where id=v_incident.id;
 select * into v_room from public.lodging_rooms where id=v_incident.room_id for update;
 select case when bool_or(blocks_room='out_of_service') then 'out_of_service' else 'maintenance' end into remaining
 from public.lodging_incidents where room_id=v_room.id and blocks_room is not null and room_released_at is null and id<>v_incident.id;
 perform public.lodging_ops_context('maintenance','Resuelta: '||left(v_incident.description,120),null,null);
 if remaining is not null then
  update public.lodging_rooms set status=remaining where id=v_room.id and status<>remaining;
  return false;
 end if;
 -- El trigger de sincronización deja la habitación en pending_inspection.
 update public.lodging_rooms set status='available' where id=v_room.id and status in('maintenance','out_of_service');
 return true;
end $$;
revoke execute on function public.lodging_incident_block_room(public.lodging_incidents,text),public.lodging_incident_release_room(public.lodging_incidents) from public,anon,authenticated;
-- ---------- Reportar problema ----------
-- payload: unit_id, room_id (opcional), category, description, priority, block ('maintenance'|'out_of_service'|null).
create or replace function public.lodging_incident_report(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; v_room public.lodging_rooms; v_block text; v_id uuid; v_inc public.lodging_incidents; v_source text;
begin
 if not public.lodging_incident_can_report() then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=nullif(payload->>'unit_id','')::uuid and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if nullif(payload->>'room_id','') is not null then
  select * into v_room from public.lodging_rooms where id=(payload->>'room_id')::uuid;
  if v_room.id is null or v_room.business_unit_id<>unit.id then raise exception 'Habitacion invalida'; end if;
 end if;
 if coalesce(payload->>'category','') not in('bano','agua_caliente','electricidad','tv','wifi','cerradura','mobiliario','ventana','limpieza','ropa_cama','plomeria','otro') then raise exception 'Categoria invalida'; end if;
 if char_length(coalesce(btrim(payload->>'description'),''))<3 then raise exception 'Describe el problema'; end if;
 if coalesce(payload->>'priority','medium') not in('low','medium','high','critical') then raise exception 'Prioridad invalida'; end if;
 v_block:=nullif(payload->>'block','');
 if v_block is not null then
  if v_room.id is null then raise exception 'Para bloquear hay que indicar la habitacion'; end if;
  if v_block not in('maintenance','out_of_service') then raise exception 'Bloqueo invalido'; end if;
  if v_block='maintenance' and not (public.has_permission('lodging.rooms.inspect') or public.has_permission('lodging.maintenance.manage')) then raise exception 'Sin autorizacion para bloquear la habitacion'; end if;
  if v_block='out_of_service' and not public.has_permission('lodging.maintenance.manage') then raise exception 'Sin autorizacion para dejar la habitacion fuera de servicio'; end if;
 end if;
 v_source:=case when public.has_permission('lodging.rooms.inspect') then 'reception' when public.has_permission('lodging.housekeeping.execute') then 'housekeeping' else 'manual' end;
 insert into public.lodging_incidents(company_id,business_unit_id,room_id,source,category,description,priority,reported_by)
 values(unit.company_id,unit.id,v_room.id,v_source,payload->>'category',btrim(payload->>'description'),coalesce(payload->>'priority','medium'),me)
 returning * into v_inc;
 if v_block is not null then perform public.lodging_incident_block_room(v_inc,v_block); end if;
 return v_inc.id;
end $$;
-- ---------- Gestión (asignar, iniciar, resolver, cancelar, bloquear, liberar) ----------
create or replace function public.lodging_incident_update(target_incident uuid,v_action text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_inc public.lodging_incidents; v_assignee uuid;
begin
 if not public.has_permission('lodging.maintenance.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_inc from public.lodging_incidents where id=target_incident for update;
 if v_inc.id is null or not public.can_access_unit(v_inc.company_id,v_inc.business_unit_id) then raise exception 'Incidencia no encontrada'; end if;
 if v_inc.status in('resolved','cancelled') and v_action<>'unblock' then raise exception 'La incidencia ya esta cerrada'; end if;
 if v_action='assign' then
  v_assignee:=nullif(payload->>'assigned_to','')::uuid;
  if v_assignee is null or not exists(select 1 from public.user_business_units u join public.profiles p on p.id=u.user_id and p.active and p.deleted_at is null
    where u.user_id=v_assignee and u.business_unit_id=v_inc.business_unit_id) then raise exception 'Responsable invalido'; end if;
  update public.lodging_incidents set assigned_to=v_assignee,assigned_at=now(),status=case when status='open' then 'assigned' else status end where id=v_inc.id;
 elsif v_action='start' then
  update public.lodging_incidents set status='in_progress',started_at=coalesce(started_at,now()),assigned_to=coalesce(assigned_to,me),assigned_at=coalesce(assigned_at,now()) where id=v_inc.id;
 elsif v_action='resolve' then
  if char_length(coalesce(btrim(payload->>'notes'),''))<3 then raise exception 'Indica como se resolvio'; end if;
  update public.lodging_incidents set status='resolved',resolved_at=now(),resolved_by=me,resolution_notes=btrim(payload->>'notes') where id=v_inc.id;
  perform public.lodging_incident_release_room(v_inc);
 elsif v_action='cancel' then
  if char_length(coalesce(btrim(payload->>'reason'),''))<3 then raise exception 'Indica el motivo'; end if;
  update public.lodging_incidents set status='cancelled',cancel_reason=btrim(payload->>'reason'),resolved_at=now(),resolved_by=me where id=v_inc.id;
  perform public.lodging_incident_release_room(v_inc);
 elsif v_action='block' then
  if v_inc.room_id is null then raise exception 'La incidencia no tiene habitacion'; end if;
  if coalesce(payload->>'kind','') not in('maintenance','out_of_service') then raise exception 'Bloqueo invalido'; end if;
  perform public.lodging_incident_block_room(v_inc,payload->>'kind');
 elsif v_action='unblock' then
  perform public.lodging_incident_release_room(v_inc);
 else
  raise exception 'Accion invalida';
 end if;
end $$;
-- ---------- Fotos (Storage privado; ruta company/unit/incident/archivo) ----------
create or replace function public.lodging_incident_attach(target_incident uuid,object_path text,mime text,size_bytes bigint,original_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_inc public.lodging_incidents; v_id uuid;
begin
 select * into v_inc from public.lodging_incidents where id=target_incident for update;
 if v_inc.id is null or not public.can_access_unit(v_inc.company_id,v_inc.business_unit_id) then raise exception 'Incidencia no encontrada'; end if;
 if not (v_inc.reported_by=auth.uid() or public.has_permission('lodging.maintenance.manage')) then raise exception 'Sin autorizacion'; end if;
 if object_path not like v_inc.company_id::text||'/'||v_inc.business_unit_id::text||'/'||v_inc.id::text||'/%' then raise exception 'Ruta invalida'; end if;
 if (select count(*) from public.lodging_incident_attachments where incident_id=v_inc.id and deleted_at is null)>=5 then raise exception 'Maximo 5 fotos por incidencia'; end if;
 insert into public.lodging_incident_attachments(company_id,business_unit_id,incident_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
 values(v_inc.company_id,v_inc.business_unit_id,v_inc.id,object_path,left(coalesce(original_name,'foto'),200),mime,size_bytes,auth.uid()) returning id into v_id;
 return v_id;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lodging-operations','lodging-operations',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Subir: quien reportó (o gestiona) la incidencia, dentro de su unidad.
create policy lodging_operations_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='lodging-operations' and exists(
 select 1 from public.lodging_incidents i where i.id::text=(storage.foldername(name))[3]
  and i.company_id::text=(storage.foldername(name))[1] and i.business_unit_id::text=(storage.foldername(name))[2]
  and public.can_access_unit(i.company_id,i.business_unit_id)
  and (i.reported_by=(select auth.uid()) or public.has_permission('lodging.maintenance.manage'))));
-- Ver: quien puede ver incidencias de la unidad o quien la reportó (URLs firmadas).
create policy lodging_operations_objects_read on storage.objects for select to authenticated
using (bucket_id='lodging-operations' and exists(
 select 1 from public.lodging_incidents i where i.id::text=(storage.foldername(name))[3] and i.business_unit_id::text=(storage.foldername(name))[2]
  and (public.lodging_incident_can_view(i.company_id,i.business_unit_id) or (i.reported_by=(select auth.uid()) and public.can_access_unit(i.company_id,i.business_unit_id)))));
-- ---------- Consultas del portal ----------
create or replace function public.lodging_incident_board(target_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units; today date:=(now() at time zone 'America/Santiago')::date; result jsonb;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.lodging_incident_can_view(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 select coalesce(jsonb_agg(x order by x.sort_key,x.created_at desc),'[]'::jsonb) into result from (
  select i.id,i.status,i.priority,i.category,i.description,i.source,i.created_at,i.room_id,r.name as room_name,
   i.blocks_room,i.room_blocked_at,i.room_released_at,rp.first_name||' '||rp.last_name as reported_by,ap.first_name||' '||ap.last_name as assigned_to,
   (select count(*) from public.lodging_incident_attachments a where a.incident_id=i.id and a.deleted_at is null) as photos,
   -- Reserva próxima (3 días) de una habitación bloqueada: requiere atención.
   (select jsonb_build_object('date',s.check_in,'guests',s.guest_count) from public.lodging_reservations s
    where i.blocks_room is not null and i.room_released_at is null and s.room_id=i.room_id and s.status in('confirmed','pending','review_required')
     and s.check_in between today and today+3 order by s.check_in limit 1) as upcoming_arrival,
   case when i.status in('open','assigned','in_progress') then (case i.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end) else 9 end as sort_key
  from public.lodging_incidents i left join public.lodging_rooms r on r.id=i.room_id
  left join public.profiles rp on rp.id=i.reported_by left join public.profiles ap on ap.id=i.assigned_to
  where i.business_unit_id=unit.id and (i.status in('open','assigned','in_progress') or i.created_at>=now()-interval '14 days')
 ) x;
 return result;
end $$;
create or replace function public.lodging_incident_detail(target_incident uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_inc public.lodging_incidents; result jsonb;
begin
 select * into v_inc from public.lodging_incidents where id=target_incident;
 if v_inc.id is null or not (public.lodging_incident_can_view(v_inc.company_id,v_inc.business_unit_id)
   or (v_inc.reported_by=auth.uid() and public.can_access_unit(v_inc.company_id,v_inc.business_unit_id))) then raise exception 'Incidencia no encontrada'; end if;
 select to_jsonb(v_inc)||jsonb_build_object('room_name',r.name,'room_operational_status',r.operational_status,
  'reported_by_name',rp.first_name||' '||rp.last_name,'assigned_to_name',ap.first_name||' '||ap.last_name,'resolved_by_name',sp.first_name||' '||sp.last_name,
  'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'path',a.object_path,'name',a.original_name) order by a.created_at)
    from public.lodging_incident_attachments a where a.incident_id=v_inc.id and a.deleted_at is null),'[]'::jsonb),
  'upcoming_arrival',(select jsonb_build_object('date',s.check_in,'guests',s.guest_count) from public.lodging_reservations s
    where v_inc.room_id is not null and s.room_id=v_inc.room_id and s.status in('confirmed','pending','review_required')
     and s.check_in between (now() at time zone 'America/Santiago')::date and (now() at time zone 'America/Santiago')::date+3 order by s.check_in limit 1))
 into result
 from (select 1) one left join public.lodging_rooms r on r.id=v_inc.room_id
 left join public.profiles rp on rp.id=v_inc.reported_by left join public.profiles ap on ap.id=v_inc.assigned_to left join public.profiles sp on sp.id=v_inc.resolved_by;
 return result;
end $$;
-- Personal asignable de la unidad (para "asignar a").
create or replace function public.lodging_unit_staff(target_unit uuid) returns table(staff_id uuid,staff_name text,staff_role text) language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units;
begin
 if not public.has_permission('lodging.maintenance.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units b where b.id=target_unit;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 return query select p.id,(p.first_name||' '||p.last_name)::text,r.name::text from public.profiles p
  join public.user_business_units u on u.user_id=p.id and u.business_unit_id=unit.id left join public.roles r on r.id=p.role_id
  where p.active and p.deleted_at is null order by p.first_name,p.last_name;
end $$;
-- Tablero del portal: agrega incidencias abiertas por habitación.
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
  'incidents_open',(select count(*) from public.lodging_incidents i where i.business_unit_id=unit.id and i.status in('open','assigned','in_progress')),
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
    -- Incidencias abiertas de la habitación (sin datos financieros ni del huésped).
    'incidents',(select jsonb_build_object('open',count(*),'blocking',coalesce(bool_or(i.blocks_room is not null and i.room_released_at is null),false),
      'top_priority',(array_agg(i.priority order by case i.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end))[1])
      from public.lodging_incidents i where i.room_id=rm.id and i.status in('open','assigned','in_progress')),
    'next_arrival',(select jsonb_build_object('date',n.check_in,'time',to_char(coalesce(n.estimated_arrival,cfg.default_checkin_time,'14:00'),'HH24:MI'),'guests',n.guest_count)
      from res n where n.room_id=rm.id and n.check_in>=today and n.status in('confirmed','pending','review_required') order by n.check_in,n.estimated_arrival nulls last limit 1)
   ) order by rm.display_order,rm.name) from rooms rm),'[]'::jsonb)
 ) into result;
 return result;
end $$;
-- ---------- RLS y privilegios ----------
alter table public.lodging_incident_attachments enable row level security;
create policy lodging_incident_attachments_select on public.lodging_incident_attachments for select to authenticated using(public.lodging_incident_can_view(company_id,business_unit_id));
drop policy lodging_incidents_select on public.lodging_incidents;
create policy lodging_incidents_select on public.lodging_incidents for select to authenticated using(public.lodging_incident_can_view(company_id,business_unit_id));
revoke all on public.lodging_incident_attachments from public,anon,authenticated;
grant select on public.lodging_incident_attachments to authenticated;
revoke execute on function public.lodging_incident_can_view(uuid,uuid),public.lodging_incident_can_report(),public.lodging_incident_report(jsonb),
 public.lodging_incident_update(uuid,text,jsonb),public.lodging_incident_attach(uuid,text,text,bigint,text),public.lodging_incident_board(uuid),
 public.lodging_incident_detail(uuid),public.lodging_unit_staff(uuid) from public,anon;
grant execute on function public.lodging_incident_can_view(uuid,uuid),public.lodging_incident_can_report(),public.lodging_incident_report(jsonb),
 public.lodging_incident_update(uuid,text,jsonb),public.lodging_incident_attach(uuid,text,text,bigint,text),public.lodging_incident_board(uuid),
 public.lodging_incident_detail(uuid),public.lodging_unit_staff(uuid) to authenticated;
commit;
