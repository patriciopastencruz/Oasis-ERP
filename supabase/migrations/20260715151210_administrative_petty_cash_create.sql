begin;

-- El Administrativo debe poder ingresar sus propios gastos de Caja Chica
-- (antes solo podía hacerlo el Administrador). Mismo alcance que el rol
-- Trabajador: crear/corregir y ver únicamente sus propias rendiciones, sin
-- ver las de otros ni las de otras unidades.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
  ('finance.petty_cash.create','finance.petty_cash.view_own')
where r.key='administrative'
on conflict do nothing;

commit;
