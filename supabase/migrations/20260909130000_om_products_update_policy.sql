begin;

-- om_update_product/om_toggle_product usan "select ... for update" antes de
-- actualizar. Postgres exige una política RLS de UPDATE aplicable para que
-- ese locking funcione (no solo la de SELECT), aunque la escritura real la
-- controle la función security invoker -- sin esto, cualquier edición fallaba
-- con "permission denied for table om_products".

create policy om_products_write on public.om_products for update to authenticated
  using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.approve'))
  with check(public.can_access_unit(company_id,business_unit_id));

grant update on public.om_products to authenticated;

commit;
