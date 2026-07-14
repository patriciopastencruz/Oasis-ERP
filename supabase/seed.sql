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
    (company_uuid, 'HU', 'Hostal Uruguay'),
    (company_uuid, 'OM', 'Oasis Modulares'),
    (company_uuid, 'DA', 'Distribuidora Altiplánica')
  on conflict (company_id, code) do update set name = excluded.name;

  -- Catálogos productivos de Distribuidora Altiplánica. Se repiten aquí de
  -- forma idempotente porque el reset local crea la unidad después de aplicar
  -- migraciones. No se insertan clientes ni operaciones ficticias.
  insert into public.dist_customer_classifications(company_id,business_unit_id,code,name,display_order)
  select bu.company_id,bu.id,lower(regexp_replace(x.name,'[^a-zA-Z0-9]+','_','g')),x.name,x.ord
  from public.business_units bu cross join unnest(array['Minimarket','Supermercado','Restaurante','Botillería','Bar','Pub','Discoteca','Hotel','Hostal','Cafetería','Empresa','Institución','Distribuidor','Particular','Otro']) with ordinality x(name,ord)
  where bu.company_id=company_uuid and bu.code='DA'
  on conflict(business_unit_id,code) do update set name=excluded.name,active=true,deleted_at=null;
  insert into public.dist_product_categories(company_id,business_unit_id,code,name,display_order)
  select bu.company_id,bu.id,x.code,x.name,x.ord from public.business_units bu
  cross join (values('ICE','Hielo',1),('WATER','Agua',2)) x(code,name,ord)
  where bu.company_id=company_uuid and bu.code='DA'
  on conflict(business_unit_id,code) do update set name=excluded.name,active=true,deleted_at=null;
  insert into public.dist_products(company_id,business_unit_id,category_id,code,name,presentation,unit,ice_weight_kg,display_order)
  select bu.company_id,bu.id,c.id,x.code,x.name,x.presentation,'unit',x.weight,x.ord
  from public.business_units bu join public.dist_product_categories c on c.business_unit_id=bu.id
  cross join (values
   ('ICE-1KG','Hielo cubo 1 kg','Bolsa 1 kg','ICE',1::numeric,1),('ICE-2KG','Hielo cubo 2 kg','Bolsa 2 kg','ICE',2,2),
   ('FRAPPE-1KG','Hielo frappé 1 kg','Bolsa 1 kg','ICE',1,3),('FRAPPE-2KG','Hielo frappé 2 kg','Bolsa 2 kg','ICE',2,4),
   ('WATER-20L','Agua 20 litros','Bidón 20 L','WATER',0,5),('WATER-6L','Agua 6 litros','Botella 6 L','WATER',0,6),
   ('WATER-16L','Agua 1,6 litros','Botella 1,6 L','WATER',0,7),('WATER-500','Agua 500 cc','Botella 500 cc','WATER',0,8)
  ) x(code,name,presentation,category,weight,ord)
  where bu.company_id=company_uuid and bu.code='DA' and c.code=x.category
  on conflict(business_unit_id,code) do update set name=excluded.name,presentation=excluded.presentation,ice_weight_kg=excluded.ice_weight_kg,active=true,deleted_at=null;

  insert into public.roles(key, name, is_system) values
    ('superadmin', 'Superadministrador', true),
    ('general_manager', 'Gerente general', true),
    ('area_manager', 'Gerente de área', true),
    ('finance_manager', 'Encargado de finanzas', true),
    ('administrator', 'Administrador', true),
    ('worker', 'Trabajador', true)
  on conflict (key) do update set name = excluded.name;

  -- Roles del módulo distribuidora pueden haber sido creados por la migración
  -- antes de este seed; asignar sus permisos después de crear roles base.
  insert into public.role_permissions(role_id,permission_id)
  select r.id,p.id from public.roles r cross join public.permissions p
  where r.key in ('superadmin','general_manager','operations_manager') and p.key like 'finance.distribution.%'
  on conflict do nothing;
  insert into public.role_permissions(role_id,permission_id)
  select r.id,p.id from public.roles r join public.permissions p on p.key in (
   'finance.distribution.view','finance.distribution.customers.manage','finance.distribution.catalogs.manage',
   'finance.distribution.orders.create','finance.distribution.orders.manage','finance.distribution.routes.manage',
   'finance.distribution.requests.review','finance.distribution.payments.manage','finance.distribution.closures.manage',
   'finance.distribution.reports.view','finance.distribution.reports.export','finance.distribution.audit.view')
  where r.key='administrator' on conflict do nothing;
  insert into public.role_permissions(role_id,permission_id)
  select r.id,p.id from public.roles r join public.permissions p on p.key in (
   'finance.distribution.view','finance.distribution.customers.manage','finance.distribution.orders.create',
   'finance.distribution.routes.manage','finance.distribution.requests.create','finance.distribution.payments.manage',
   'finance.distribution.reports.view') where r.key='administrative' on conflict do nothing;
  insert into public.role_permissions(role_id,permission_id)
  select r.id,p.id from public.roles r join public.permissions p on p.key in
   ('finance.distribution.view','finance.distribution.driver') where r.key='driver' on conflict do nothing;

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

  -- Datos operativos iniciales de Hostal Uruguay. Las fechas son relativas para
  -- que el calendario local siempre muestre ejemplos vigentes.
  insert into public.lodging_rooms(company_id,business_unit_id,code,name,capacity,base_rate,display_order)
  select company_uuid,bu.id,'P'||n,'Pieza '||n,2,35000,n
  from public.business_units bu cross join generate_series(1,5) n
  where bu.company_id=company_uuid and bu.code='HU'
  on conflict(business_unit_id,code) do nothing;

  with hu as (select id from public.business_units where company_id=company_uuid and code='HU'),
  new_guests as (
    insert into public.lodging_guests(company_id,business_unit_id,full_name,phone,email)
    select company_uuid,hu.id,x.name,x.phone,x.email from hu cross join (values
      ('Reserva Booking — información pendiente','Pendiente',null::text),
      ('Reserva Airbnb — información pendiente','Pendiente',null::text),
      ('Ana Martínez','+56 9 5555 0101','ana@example.test'),
      ('Empresa Andina','+56 9 5555 0202','viajes@example.test')
    ) x(name,phone,email) returning id,full_name,business_unit_id
  )
  insert into public.lodging_reservations(company_id,business_unit_id,room_id,guest_id,origin,status,check_in,check_out,guest_count,nightly_rate,total_value,imported_from_ical,information_complete,company_name)
  select company_uuid,g.business_unit_id,r.id,g.id,v.origin,'confirmed',current_date+v.start_day,current_date+v.end_day,1,v.rate,(v.end_day-v.start_day)*v.rate,v.external,v.complete,v.company_name
  from new_guests g
  join (values
    ('Reserva Booking — información pendiente','booking',1,3,0::numeric,true,false,null::text,'P1'),
    ('Reserva Airbnb — información pendiente','airbnb',2,5,0::numeric,true,false,null::text,'P2'),
    ('Ana Martínez','direct',1,4,35000::numeric,false,true,null::text,'P3'),
    ('Empresa Andina','company',4,7,32000::numeric,false,true,'Empresa Andina','P4')
  ) v(guest_name,origin,start_day,end_day,rate,external,complete,company_name,room_code) on v.guest_name=g.full_name
  join public.lodging_rooms r on r.business_unit_id=g.business_unit_id and r.code=v.room_code
  on conflict do nothing;
end $$;

commit;
