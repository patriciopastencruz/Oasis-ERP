begin;

-- Bandeja de aprobaciones transversal en Administracion General: junta en
-- una sola pantalla lo pendiente de Cotizaciones, Solicitud de Pagos,
-- Caja Chica, Inventario y Distribuidora para roles gerenciales, sin
-- ampliar su acceso a Usuarios/Roles/Flujos de aprobacion.

insert into public.permissions(key,module,description) values
  ('administration.approvals.view','administration','Ver bandeja de aprobaciones transversal')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('superadmin','general_manager','operations_manager','area_manager')
  and p.key='administration.approvals.view'
on conflict do nothing;

-- Bug preexistente: esta tabla nunca recibio grant de SELECT para
-- authenticated (a diferencia de sus tablas hermanas, corregidas en
-- 20260714192547_distribution_raw_material_stock.sql), asi que
-- /inventory/approvals y la bandeja nueva no podian leerla.
grant select on public.inventory_change_requests to authenticated;
grant all on public.inventory_change_requests to service_role;

commit;
