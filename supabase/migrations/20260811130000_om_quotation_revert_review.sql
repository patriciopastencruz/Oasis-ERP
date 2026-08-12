begin;

-- Permite a un aprobador revertir por error una decision ya tomada
-- (aprobada o rechazada) de vuelta a pendiente, para poder resolverla de
-- nuevo. Bloquea la reversion si la cotizacion ya tiene un proyecto
-- asociado (om_projects.quotation_id es unique), ya que revertir dejaria
-- un proyecto vigente colgado de una cotizacion no aprobada.

create or replace function public.om_revert_quotation_review(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare q public.om_quotations;
begin
 if not public.has_permission('sales.quotations.approve') then raise exception 'Sin autorizacion'; end if;
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if not public.can_access_unit(q.company_id,q.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if q.status not in('approved','rejected') then raise exception 'Solo se puede revertir una cotizacion aprobada o rechazada'; end if;
 if exists(select 1 from public.om_projects where quotation_id=q.id) then raise exception 'No se puede revertir: ya tiene un proyecto asociado'; end if;
 update public.om_quotations set status='pending',reviewed_by=null,reviewed_at=null,resolution_comment=null,updated_by=auth.uid(),updated_at=now() where id=q.id;
end $$;

grant execute on function public.om_revert_quotation_review(uuid) to authenticated;

commit;
