begin;

-- Módulo transversal "Indicadores KPIs" (tablero en tiempo real y reporte PDF de
-- los 3 hostales). Solo del administrador hacia arriba.
insert into public.permissions(key,module,description) values
 ('kpis.view','kpis','Ver el módulo Indicadores KPIs (tablero en tiempo real y reporte PDF de los hostales)')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='kpis.view' and r.key in('administrator','general_manager','superadmin')
on conflict do nothing;

commit;
