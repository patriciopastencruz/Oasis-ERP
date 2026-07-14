-- Seed revisable de OASIS ERP. Antes de ejecutar, reemplace el RUT indicado.
begin;

do $$
declare
  oasis_rut text := '78.271.136-9';
  company_uuid uuid;
  admin_role uuid;
  finance_role uuid;
  area_manager_role uuid;
  workflow_uuid uuid;
  unit record;
begin
  if not public.is_valid_chilean_rut(oasis_rut) then
    raise exception 'Debe reemplazar oasis_rut por el RUT real y válido de Oasis Company';
  end if;

  insert into public.companies(code, legal_name, trade_name, rut)
  values ('OASIS', 'Oasis Company', 'Oasis Company', oasis_rut)
  on conflict (code) do update set legal_name = excluded.legal_name, trade_name = excluded.trade_name
  returning id into company_uuid;

  insert into public.business_units(company_id, code, name) values
    (company_uuid, 'HOC', 'Hostal Oasis Centro'),
    (company_uuid, 'HOB', 'Hostal Oasis Cobija'),
    (company_uuid, 'OM', 'Oasis Modulares'),
    (company_uuid, 'DA', 'Distribuidora Altiplánica')
  on conflict (company_id, code) do update set name = excluded.name;

  insert into public.roles(key, name, is_system) values
    ('superadmin', 'Superadministrador', true),
    ('general_manager', 'Gerente general', true),
    ('area_manager', 'Gerente de área', true),
    ('finance_manager', 'Encargado de finanzas', true),
    ('administrator', 'Administrador', true),
    ('worker', 'Trabajador', true)
  on conflict (key) do update set name = excluded.name;

  insert into public.permissions(key, module, description) values
    ('administration.companies.manage','administration','Administrar empresas'),
    ('administration.business_units.manage','administration','Administrar unidades'),
    ('administration.users.manage','administration','Administrar usuarios y asignaciones'),
    ('administration.roles.manage','administration','Administrar roles y permisos'),
    ('administration.settings.manage','administration','Administrar configuración'),
    ('administration.categories.manage','administration','Administrar categorías'),
    ('administration.cost_centers.manage','administration','Administrar centros de costo'),
    ('administration.approval_rules.manage','administration','Administrar límites de aprobación'),
    ('audit.logs.view','audit','Consultar auditoría'),
    ('reports.executive_dashboard.view','reports','Consultar indicadores ejecutivos autorizados'),
    ('finance.payment_requests.create','finance','Crear solicitudes'),
    ('finance.payment_requests.view_unit','finance','Ver solicitudes de unidades asignadas'),
    ('finance.payment_requests.view_company','finance','Ver solicitudes de empresas asignadas'),
    ('finance.approvals.decide','finance','Decidir aprobaciones autorizadas'),
    ('finance.payments.view','finance','Consultar pagos'),
    ('finance.payments.manage','finance','Gestionar estado financiero de solicitudes'),
    ('finance.payments.schedule','finance','Programar pagos'),
    ('finance.payments.execute','finance','Registrar pagos ejecutados'),
    ('finance.suppliers.view','finance','Consultar proveedores'),
    ('finance.suppliers.manage','finance','Administrar proveedores'),
    ('finance.petty_cash.view','finance','Consultar caja chica'),
    ('finance.petty_cash.manage','finance','Administrar caja chica'),
    ('finance.petty_cash.create','finance','Crear y corregir rendiciones propias de Caja Chica'),
    ('finance.petty_cash.view_own','finance','Consultar rendiciones propias de Caja Chica'),
    ('finance.petty_cash.view_unit','finance','Consultar rendiciones de Caja Chica de unidades asignadas'),
    ('finance.petty_cash.review','finance','Revisar y observar rendiciones de Caja Chica'),
    ('finance.petty_cash.approve','finance','Aprobar o rechazar rendiciones de Caja Chica'),
    ('finance.petty_cash.reports.view','finance','Consultar reportes consolidados de Caja Chica'),
    ('finance.petty_cash.reports.export','finance','Exportar reportes de Caja Chica')
  on conflict (key) do update set description = excluded.description, active = true;

  -- Superadministrador: todos los permisos.
  insert into public.role_permissions(role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'superadmin'
  on conflict do nothing;
  -- Gerencia general: lectura consolidada, aprobación y auditoría.
  insert into public.role_permissions(role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in
    ('finance.payment_requests.view_company','finance.approvals.decide','finance.payments.view','finance.suppliers.view','finance.petty_cash.view','audit.logs.view','reports.executive_dashboard.view')
  where r.key = 'general_manager' on conflict do nothing;
  -- Gerencia de área.
  insert into public.role_permissions(role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in
    ('finance.payment_requests.create','finance.payment_requests.view_unit','finance.approvals.decide','finance.payments.view','finance.suppliers.view','finance.suppliers.manage','finance.petty_cash.view','reports.executive_dashboard.view')
  where r.key = 'area_manager' on conflict do nothing;
  -- Finanzas.
  insert into public.role_permissions(role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in
    ('finance.payment_requests.view_unit','finance.approvals.decide','finance.payments.view','finance.payments.manage','finance.payments.schedule','finance.payments.execute','finance.suppliers.view','finance.suppliers.manage','finance.petty_cash.view','finance.petty_cash.view_unit','finance.petty_cash.manage','finance.petty_cash.reports.view','finance.petty_cash.reports.export','reports.executive_dashboard.view')
  where r.key = 'finance_manager' on conflict do nothing;
  -- Administrador.
  insert into public.role_permissions(role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in
    ('finance.payment_requests.create','finance.payment_requests.view_unit','finance.approvals.decide','finance.suppliers.view','finance.suppliers.manage','finance.petty_cash.view','finance.petty_cash.manage','finance.petty_cash.create','finance.petty_cash.view_own','finance.petty_cash.view_unit','finance.petty_cash.review','finance.petty_cash.approve')
  where r.key = 'administrator' on conflict do nothing;
  -- Trabajador.
  insert into public.role_permissions(role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in ('finance.payment_requests.create','finance.suppliers.view','finance.petty_cash.create','finance.petty_cash.view_own')
  where r.key = 'worker' on conflict do nothing;

  select id into admin_role from public.roles where key = 'administrator';
  select id into finance_role from public.roles where key = 'finance_manager';
  select id into area_manager_role from public.roles where key = 'area_manager';

  for unit in select id from public.business_units where company_id = company_uuid loop
    insert into public.approval_workflows(company_id,business_unit_id,code,name,correction_policy,active,priority_order)
    values(company_uuid,unit.id,'PAY-LOW','Pagos hasta 100.000','restart_all',true,10)
    on conflict(company_id,business_unit_id,code) do update set active=true
    returning id into workflow_uuid;
    insert into public.approval_workflow_conditions(company_id,workflow_id,min_amount,max_amount)
    values(company_uuid,workflow_uuid,0,100000) on conflict(workflow_id) do update set min_amount=0,max_amount=100000;
    insert into public.approval_workflow_steps(company_id,workflow_id,name,sequence_order,required_role_id,is_required,allow_higher_role_substitution)
    values(company_uuid,workflow_uuid,'Aprobación de Administrador',1,admin_role,true,true) on conflict do nothing;

    insert into public.approval_workflows(company_id,business_unit_id,code,name,correction_policy,active,priority_order)
    values(company_uuid,unit.id,'PAY-MEDIUM','Pagos de 100.001 a 500.000','restart_all',true,10)
    on conflict(company_id,business_unit_id,code) do update set active=true
    returning id into workflow_uuid;
    insert into public.approval_workflow_conditions(company_id,workflow_id,min_amount,max_amount)
    values(company_uuid,workflow_uuid,100001,500000) on conflict(workflow_id) do update set min_amount=100001,max_amount=500000;
    insert into public.approval_workflow_steps(company_id,workflow_id,name,sequence_order,required_role_id,is_required,allow_higher_role_substitution)
    values(company_uuid,workflow_uuid,'Aprobación de Finanzas',1,finance_role,true,true) on conflict do nothing;

    insert into public.approval_workflows(company_id,business_unit_id,code,name,correction_policy,active,priority_order)
    values(company_uuid,unit.id,'PAY-HIGH','Pagos desde 500.001','restart_all',true,10)
    on conflict(company_id,business_unit_id,code) do update set active=true
    returning id into workflow_uuid;
    insert into public.approval_workflow_conditions(company_id,workflow_id,min_amount,max_amount)
    values(company_uuid,workflow_uuid,500001,null) on conflict(workflow_id) do update set min_amount=500001,max_amount=null;
    insert into public.approval_workflow_steps(company_id,workflow_id,name,sequence_order,required_role_id,is_required,allow_higher_role_substitution)
    values(company_uuid,workflow_uuid,'Aprobación de Gerente de Área',1,area_manager_role,true,true) on conflict do nothing;
  end loop;

  insert into public.app_settings(scope, company_id, key, value, description) values
    ('company', company_uuid, 'locale', '"es-CL"'::jsonb, 'Idioma y formato regional'),
    ('company', company_uuid, 'timezone', '"America/Santiago"'::jsonb, 'Zona horaria de negocio'),
    ('company', company_uuid, 'currency', '"CLP"'::jsonb, 'Moneda operativa única'),
    ('company', company_uuid, 'petty_cash_weekly_target', '100000'::jsonb, 'Fondo objetivo inicial')
  on conflict (company_id, key) do update set value = excluded.value;
end $$;

commit;
