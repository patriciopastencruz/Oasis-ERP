begin;

-- Permite anular una solicitud aprobada o programada que ya no se pagará,
-- conservando el registro y su trazabilidad (auditoría, decisiones de
-- aprobación) en vez de eliminarlo físicamente. El mismo permiso que ya
-- habilita "Registrar pago" (finance.payments.manage) habilita anular, ya
-- que ambas acciones ocurren en la misma etapa del ciclo de vida.
create or replace function public.cancel_payment_request(target_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.payment_requests%rowtype;
begin
 if not public.has_permission('finance.payments.manage') then raise exception using errcode='42501',message='Usuario no autorizado para anular esta solicitud'; end if;
 if length(trim(coalesce(reason,''))) < 3 then raise exception using errcode='P0001',message='El motivo de anulación es obligatorio'; end if;
 select * into strict r from public.payment_requests where id=target_id for update;
 if not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception using errcode='42501',message='Sin acceso a esta unidad'; end if;
 if r.status not in ('approved','scheduled') then raise exception using errcode='P0001',message='Solo se pueden anular solicitudes aprobadas o programadas'; end if;
 update public.payment_requests set status='cancelled',cancellation_reason=trim(reason),cancelled_at=now() where id=r.id;
end $$;
revoke all on function public.cancel_payment_request(uuid,text) from public,anon;
grant execute on function public.cancel_payment_request(uuid,text) to authenticated,service_role;

commit;
