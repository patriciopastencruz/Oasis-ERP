begin;

-- Permite eliminar (soft-delete) cotizaciones de Oasis Modulares que aun no
-- avanzaron del flujo: solo el vendedor que la creo puede borrarla, y solo
-- mientras este en borrador o rechazada, igual que la regla de edicion de
-- om_update_quotation.

create or replace function public.om_delete_quotation(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations;
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected') then raise exception 'Solo se pueden eliminar cotizaciones en borrador o rechazadas'; end if;
 update public.om_quotations set deleted_at=now(),updated_by=me,updated_at=now() where id=q.id;
end $$;

grant execute on function public.om_delete_quotation(uuid) to authenticated;

commit;
