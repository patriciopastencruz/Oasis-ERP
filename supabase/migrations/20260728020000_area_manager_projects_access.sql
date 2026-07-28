begin;

-- El rol Gerente de area (area_manager) ya tenia paridad con Gerente
-- general/Gerente de Operaciones en Cotizaciones (create+approve), pero
-- quedo fuera por completo del modulo de Proyectos (20260727010000)
-- desde que este se creo -- ni "Proyectos" en el sidebar ni el boton
-- "Crear proyecto" le aparecian. Se otorga control total del modulo
-- (los 11 permisos sales.projects.*), a pedido explicito del usuario.

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='area_manager' and p.key like 'sales.projects.%'
on conflict do nothing;

commit;
