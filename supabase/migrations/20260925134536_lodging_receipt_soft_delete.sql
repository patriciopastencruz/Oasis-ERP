begin;

-- Quitar un comprobante subido por error (típicamente duplicado por un
-- doble clic). No se borra la fila ni el archivo: se marca deleted_at y
-- queda en audit_logs, igual que el resto de las operaciones comerciales.
-- lodging_payment_receipts solo tiene policies de select/insert, así que la
-- escritura pasa por esta función security definer, que valida permiso y
-- unidad por dentro (mismo patrón que remove_lodging_imported_reservation).
create or replace function public.remove_lodging_payment_receipt(target_receipt uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  if not public.has_permission('lodging.payments.manage') then
    raise exception 'Sin autorización';
  end if;

  select * into rec from public.lodging_payment_receipts
  where id = target_receipt for update;
  if not found then
    raise exception 'Comprobante no encontrado';
  end if;
  if not public.can_access_unit(rec.company_id, rec.business_unit_id) then
    raise exception 'Sin autorización';
  end if;
  if rec.deleted_at is not null then
    raise exception 'El comprobante ya fue eliminado';
  end if;

  update public.lodging_payment_receipts
  set deleted_at = now()
  where id = target_receipt;

  insert into public.audit_logs(company_id, business_unit_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (rec.company_id, rec.business_unit_id, auth.uid(), 'remove_payment_receipt',
          'lodging_payment_receipts', rec.id, to_jsonb(rec),
          jsonb_build_object('deleted_at', now()));
end
$$;

grant execute on function public.remove_lodging_payment_receipt(uuid) to authenticated;
revoke execute on function public.remove_lodging_payment_receipt(uuid) from public, anon;

commit;
