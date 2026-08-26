begin;

-- Hasta ahora no había forma de eliminar un calendario externo mal
-- configurado desde el ERP (solo crear). lodging_ical_configs tiene
-- policies de select/insert/update pero ninguna de delete, y las tablas
-- relacionadas (lodging_ical_events, lodging_sync_logs) ni siquiera
-- otorgan delete a authenticated -- ver 20260714003139_hostal_uruguay_reservations.sql.
-- En vez de agregar esos grants/policies sueltos, se sigue el mismo patrón
-- que review_lodging_public_request: una función security definer que
-- valida el permiso por dentro y hace la limpieza completa en un solo paso
-- (desvincula reservas ya importadas en vez de borrarlas -- son reservas
-- reales, solo pierden la referencia al calendario que se está eliminando).
create or replace function public.delete_lodging_ical_config(target_config uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
begin
  select company_id, business_unit_id into cfg
  from public.lodging_ical_configs
  where id = target_config
  for update;

  if not found then
    raise exception 'Calendario no encontrado';
  end if;
  if not public.can_access_unit(cfg.company_id, cfg.business_unit_id) then
    raise exception 'Sin autorización';
  end if;
  if not public.has_permission('lodging.ical.configure') then
    raise exception 'Sin autorización';
  end if;

  update public.lodging_reservations
  set external_calendar_id = null
  where external_calendar_id = target_config;

  delete from public.lodging_ical_events where config_id = target_config;
  delete from public.lodging_sync_logs where config_id = target_config;
  delete from public.lodging_ical_configs where id = target_config;
end
$$;

grant execute on function public.delete_lodging_ical_config(uuid) to authenticated;
revoke execute on function public.delete_lodging_ical_config(uuid) from public, anon;

commit;
