begin;

-- Gerente de area tambien gestiona cotizaciones de Oasis Modulares junto a
-- su rol operativo existente (Caja Chica, Solicitud de Pagos, Inventario).
-- A diferencia de operations_manager/general_manager, este rol no
-- comparte permisos con Cotizaciones, asi que se agregan explicitamente
-- sin tocar los que ya tenia.

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='area_manager' and p.key in('sales.quotations.create','sales.quotations.approve')
on conflict do nothing;

commit;
