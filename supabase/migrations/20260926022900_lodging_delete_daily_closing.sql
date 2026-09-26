begin;

-- Eliminar un cierre diario de hostal (borrador o emitido), solo con permiso
-- de gestión. El cierre es un reporte derivado de reservas y pagos (que no se
-- tocan), así que se borra físicamente para liberar la fecha. Queda en
-- audit_logs: el trigger registra la fila completa y aquí se agrega el motivo.
create or replace function public.lodging_delete_daily_closing(target_closing uuid,reason text) returns date language plpgsql security definer set search_path='' as $$
declare c public.lodging_daily_closings;
begin
 if not public.has_permission('lodging.closings.manage') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if char_length(coalesce(btrim(reason),''))<3 then raise exception 'Indica el motivo de la eliminacion'; end if;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(c.company_id,c.business_unit_id,auth.uid(),'delete_request','lodging_daily_closings',c.id,
  jsonb_build_object('closing_date',c.closing_date,'status',c.status,'total_received',c.total_received,'email_sent_at',c.email_sent_at),
  jsonb_build_object('reason',btrim(reason)));
 delete from public.lodging_daily_closing_expenses where closing_id=c.id;
 delete from public.lodging_daily_closings where id=c.id;
 return c.closing_date;
end $$;

revoke execute on function public.lodging_delete_daily_closing(uuid,text) from public,anon;
grant execute on function public.lodging_delete_daily_closing(uuid,text) to authenticated;

commit;
