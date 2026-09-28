begin;

-- Correcciones de la fase E sobre la versión ya aplicada de 20260928021646:
-- liberar la habitación cuando no queda otra incidencia bloqueante, origen
-- 'manual' cuando reporta administración y políticas de Storage que no
-- dependen del RLS de lodging_incidents (aseo reporta sin poder listarlas).

create or replace function public.lodging_incident_release_room(v_incident public.lodging_incidents) returns boolean language plpgsql security definer set search_path='' as $$
declare v_room public.lodging_rooms; remaining text;
begin
 if v_incident.blocks_room is null or v_incident.room_released_at is not null then return false; end if;
 update public.lodging_incidents set room_released_at=now() where id=v_incident.id;
 select * into v_room from public.lodging_rooms where id=v_incident.room_id for update;
 select case when count(*)=0 then null when bool_or(blocks_room='out_of_service') then 'out_of_service' else 'maintenance' end into remaining
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
revoke execute on function public.lodging_incident_release_room(public.lodging_incidents) from public,anon,authenticated;

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
 v_source:=case when public.has_permission('lodging.maintenance.manage') then 'manual' when public.has_permission('lodging.rooms.inspect') then 'reception' when public.has_permission('lodging.housekeeping.execute') then 'housekeeping' else 'manual' end;
 insert into public.lodging_incidents(company_id,business_unit_id,room_id,source,category,description,priority,reported_by)
 values(unit.company_id,unit.id,v_room.id,v_source,payload->>'category',btrim(payload->>'description'),coalesce(payload->>'priority','medium'),me)
 returning * into v_inc;
 if v_block is not null then perform public.lodging_incident_block_room(v_inc,v_block); end if;
 return v_inc.id;
end $$;

-- Acceso a un objeto del bucket: la ruta company/unit/incident/archivo debe
-- corresponder a una incidencia de una unidad asignada. security definer porque
-- aseo reporta sin poder listar incidencias (RLS de lodging_incidents).
create or replace function public.lodging_incident_storage_access(object_name text,for_write boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/'); v_inc public.lodging_incidents;
begin
 if array_length(parts,1)<>4 or parts[3] !~ '^[0-9a-f-]{36}$' then return false; end if;
 select * into v_inc from public.lodging_incidents where id=parts[3]::uuid;
 if v_inc.id is null or v_inc.company_id::text<>parts[1] or v_inc.business_unit_id::text<>parts[2]
  or not public.can_access_unit(v_inc.company_id,v_inc.business_unit_id) then return false; end if;
 if for_write then return v_inc.reported_by=auth.uid() or public.has_permission('lodging.maintenance.manage'); end if;
 return v_inc.reported_by=auth.uid() or public.lodging_incident_can_view(v_inc.company_id,v_inc.business_unit_id);
end $$;
revoke execute on function public.lodging_incident_storage_access(text,boolean) from public,anon;
grant execute on function public.lodging_incident_storage_access(text,boolean) to authenticated;
-- Subir: quien reportó (o gestiona) la incidencia. Ver: quien la reportó o puede ver incidencias (URLs firmadas).
drop policy if exists lodging_operations_objects_insert on storage.objects;
drop policy if exists lodging_operations_objects_read on storage.objects;
create policy lodging_operations_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='lodging-operations' and public.lodging_incident_storage_access(name,true));
create policy lodging_operations_objects_read on storage.objects for select to authenticated
using (bucket_id='lodging-operations' and public.lodging_incident_storage_access(name,false));

commit;
