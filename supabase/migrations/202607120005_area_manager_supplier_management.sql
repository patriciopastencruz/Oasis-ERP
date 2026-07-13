begin;

-- Gerentes de área pueden crear y editar los datos generales de proveedores.
-- La administración de cuentas bancarias conserva permisos independientes.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key = 'finance.suppliers.manage'
where r.key = 'area_manager'
on conflict do nothing;

commit;
