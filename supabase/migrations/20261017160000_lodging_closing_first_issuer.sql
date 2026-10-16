begin;

-- Quién emitió por primera vez cada cierre. `issued_by` cambia cada vez que se
-- reemite, y el bono de recepción necesita saber si el cierre lo hizo la
-- recepcionista de turno o la persona de apoyo que lo hace después.
alter table public.lodging_daily_closings add column first_issued_by uuid references public.profiles(id);

alter table public.lodging_daily_closings disable trigger audit_lodging_daily_closings;
alter table public.lodging_daily_closings disable trigger lodging_daily_closings_updated_at;
update public.lodging_daily_closings c set first_issued_by=coalesce(
 (select a.actor_id from public.audit_logs a where a.entity_id=c.id and a.new_data->>'status'='issued' order by a.created_at limit 1),
 c.issued_by)
where c.status='issued' and c.first_issued_by is null;
alter table public.lodging_daily_closings enable trigger audit_lodging_daily_closings;
alter table public.lodging_daily_closings enable trigger lodging_daily_closings_updated_at;

create or replace function public.lodging_issue_daily_closing(target_closing uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_daily_closings; today date:=(now() at time zone 'America/Santiago')::date;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status='issued' then raise exception 'El cierre ya fue emitido'; end if;
 if c.closing_date<today-1 and not public.has_permission('lodging.closings.manage') and not public.lodging_closing_date_authorized(c.business_unit_id,c.closing_date) then
  raise exception 'Para cerrar una fecha anterior a ayer necesitas autorizacion del administrador'; end if;
 perform public.lodging_apply_closing_snapshot(c.id);
 update public.lodging_daily_closings set status='issued',issued_at=now(),first_issued_at=coalesce(first_issued_at,now()),first_issued_by=coalesce(first_issued_by,auth.uid()),issued_by=auth.uid(),version=version+1,updated_by=auth.uid() where id=c.id;
end $$;

commit;
