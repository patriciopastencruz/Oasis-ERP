begin;

-- El Administrativo debe poder cargar y editar precios de clientes en
-- Distribuidora Altiplánica. El esquema actual no separa "precios" del
-- resto del catálogo (finance.distribution.catalogs.manage cubre precios,
-- productos, categorías y clasificaciones de clientes en dist_prices,
-- dist_products, dist_product_categories y dist_customer_classifications),
-- así que se otorga el permiso completo, igual que ya lo tiene Administrador.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='finance.distribution.catalogs.manage'
where r.key='administrative'
on conflict do nothing;

commit;
