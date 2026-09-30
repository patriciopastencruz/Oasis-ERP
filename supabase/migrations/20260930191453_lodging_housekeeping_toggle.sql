begin;

-- Circuito de aseo e inspección activable por hostal. Con el circuito
-- desactivado (hostales que aún no usan el portal operativo):
--  · el check-in no exige habitación inspeccionada;
--  · el check-out y las salidas automáticas no dejan la habitación sucia ni
--    crean tareas de aseo;
--  · la interfaz oculta el estado de limpieza en el calendario.
-- Mantención y fuera de servicio siguen funcionando igual. Hostal Uruguay
-- queda desactivado mientras se capacita al personal de aseo.

alter table public.lodging_ops_settings add column housekeeping_enabled boolean not null default true;

insert into public.permissions(key,module,description) values
 ('lodging.operations.configure','lodging','Activar o desactivar el circuito de aseo e inspección de un hostal')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.operations.configure' and r.key in('administrator','superadmin')
on conflict do nothing;

create or replace function public.lodging_ops_housekeeping_on(target_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select housekeeping_enabled from public.lodging_ops_settings where business_unit_id=target_unit),true)
$$;
revoke execute on function public.lodging_ops_housekeeping_on(uuid) from public,anon,authenticated;

-- Para la interfaz: solo informa si el circuito está activo en una unidad asignada.
create or replace function public.lodging_ops_housekeeping_enabled(target_unit uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 return public.lodging_ops_housekeeping_on(unit.id);
end $$;
revoke execute on function public.lodging_ops_housekeeping_enabled(uuid) from public,anon;
grant execute on function public.lodging_ops_housekeeping_enabled(uuid) to authenticated;

-- Aplica el cambio (uso interno). Al desactivar, las habitaciones sucias,
-- en limpieza o por inspeccionar quedan disponibles y se cancelan las tareas
-- abiertas; mantención y fuera de servicio no se tocan.
create or replace function public.lodging_ops_apply_housekeeping(v_unit public.business_units,enabled boolean,actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare was boolean:=public.lodging_ops_housekeeping_on(v_unit.id); rooms_reset integer:=0; tasks_cancelled integer:=0;
begin
 insert into public.lodging_ops_settings(company_id,business_unit_id,housekeeping_enabled,updated_by)
 values(v_unit.company_id,v_unit.id,enabled,actor)
 on conflict(business_unit_id) do update set housekeeping_enabled=excluded.housekeeping_enabled,updated_at=now(),updated_by=excluded.updated_by;
 if not enabled and was then
  update public.lodging_housekeeping_tasks set status='cancelled',notes=left(coalesce(notes||' · ','')||'Cancelada: aseo e inspección desactivados en el hostal',1000)
  where business_unit_id=v_unit.id and status in('pending','in_progress');
  get diagnostics tasks_cancelled=row_count;
  perform public.lodging_ops_context('manual','Aseo e inspección desactivados en el hostal',null,null);
  update public.lodging_rooms set operational_status='inspected',rework=false,
   status=case when status='cleaning' then 'available' else status end
  where business_unit_id=v_unit.id and operational_status in('dirty','cleaning','pending_inspection');
  get diagnostics rooms_reset=row_count;
 end if;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(v_unit.company_id,v_unit.id,actor,'housekeeping_toggle','lodging_ops_settings',v_unit.id,
  jsonb_build_object('housekeeping_enabled',was),
  jsonb_build_object('housekeeping_enabled',enabled,'rooms_reset',rooms_reset,'tasks_cancelled',tasks_cancelled));
end $$;
revoke execute on function public.lodging_ops_apply_housekeeping(public.business_units,boolean,uuid) from public,anon,authenticated;

create or replace function public.lodging_ops_set_housekeeping(target_unit uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units;
begin
 if auth.uid() is null or not public.has_permission('lodging.operations.configure') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 perform public.lodging_ops_apply_housekeeping(unit,enabled,auth.uid());
end $$;
revoke execute on function public.lodging_ops_set_housekeeping(uuid,boolean) from public,anon;
grant execute on function public.lodging_ops_set_housekeeping(uuid,boolean) to authenticated;

-- ---------- Check-in: sin circuito no exige inspección ----------
create or replace function public.lodging_check_in(target_reservation uuid,override_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_res public.lodging_reservations; v_room public.lodging_rooms;
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.status<>'confirmed' then raise exception 'La reserva no esta confirmada'; end if;
 select * into v_room from public.lodging_rooms where id=v_res.room_id for update;
 if v_room.operational_status<>'inspected' and public.lodging_ops_housekeeping_on(v_res.business_unit_id) then
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

-- ---------- Check-out: sin circuito no deja la habitación sucia ----------
create or replace function public.lodging_check_out(target_reservation uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_res public.lodging_reservations; v_room public.lodging_rooms; v_balance numeric; on_ boolean;
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.status<>'checked_in' then raise exception 'La reserva no tiene check-in'; end if;
 select balance into v_balance from public.lodging_payment_summary(v_res.id);
 if coalesce(v_balance,0)>0 then raise exception 'No se puede realizar el check-out con saldo pendiente'; end if;
 on_:=public.lodging_ops_housekeeping_on(v_res.business_unit_id);
 update public.lodging_reservations set status='checked_out',actual_check_out=now(),departure_processed_at=now() where id=v_res.id;
 select * into v_room from public.lodging_rooms where id=v_res.room_id for update;
 update public.lodging_rooms set status=case when status in('maintenance','out_of_service') then status when on_ then 'cleaning' else 'available' end where id=v_room.id;
 if on_ and v_room.operational_status not in('maintenance','out_of_service') then
  perform public.lodging_ops_mark_dirty(v_room,'checkout',v_res.id,1,null);
 end if;
end $$;

-- ---------- Salidas automáticas: sin circuito solo se marcan procesadas ----------
create or replace function public.lodging_ops_sync_departures(target_unit uuid) returns integer language plpgsql security definer set search_path='' as $$
declare unit public.business_units; cfg public.lodging_ops_settings; r record; v_room public.lodging_rooms; n integer:=0;
 now_local timestamp:=(now() at time zone 'America/Santiago'); on_ boolean;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not (public.lodging_ops_can_view(unit.company_id,unit.id) or
   (public.can_access_unit(unit.company_id,unit.id) and public.has_permission('lodging.reservations.view'))) then raise exception 'Unidad no autorizada'; end if;
 select * into cfg from public.lodging_ops_settings where business_unit_id=unit.id;
 on_:=coalesce(cfg.housekeeping_enabled,true);
 for r in select * from public.lodging_reservations
  where business_unit_id=unit.id and departure_processed_at is null and status not in('cancelled','conflict','checked_in')
   and origin<>'maintenance' and check_out>=now_local::date-7
   and (check_out<now_local::date or (check_out=now_local::date and now_local::time>=coalesce(cfg.default_checkout_time,'12:00')))
  for update skip locked loop
  update public.lodging_reservations set departure_processed_at=now() where id=r.id;
  if on_ then
   select * into v_room from public.lodging_rooms where id=r.room_id for update;
   if v_room.active and v_room.operational_status='inspected' then
    perform public.lodging_ops_mark_dirty(v_room,'auto_departure',r.id,1,'Salida sin check-out registrado');
    n:=n+1;
   end if;
  end if;
 end loop;
 return n;
end $$;

-- Hostal Uruguay: circuito desactivado mientras se capacita al personal de aseo.
select public.lodging_ops_apply_housekeeping(bu,false,null)
from public.business_units bu where bu.code='HU' and bu.deleted_at is null;

commit;
