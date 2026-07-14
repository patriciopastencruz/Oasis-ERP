-- Crear clientes sigue disponible para el Administrativo. Editar condiciones
-- comerciales o eliminar lógicamente un cliente requiere un rol superior.
insert into public.permissions(key, module, description)
values (
  'finance.distribution.customers.edit',
  'finance',
  'Editar y eliminar clientes de Distribuidora Altiplanica'
)
on conflict(key) do update
set description = excluded.description,
    active = true;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p
    on p.key = 'finance.distribution.customers.edit'
 where r.key in ('administrator', 'operations_manager', 'general_manager', 'superadmin')
on conflict do nothing;

drop policy if exists dist_customers_update on public.dist_customers;
create policy dist_customers_update
on public.dist_customers
for update
to authenticated
using (
  public.can_access_unit(company_id, business_unit_id)
  and public.has_permission('finance.distribution.customers.edit')
)
with check (
  public.can_access_unit(company_id, business_unit_id)
  and public.has_permission('finance.distribution.customers.edit')
);
