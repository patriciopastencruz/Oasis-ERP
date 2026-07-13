begin;
alter table public.suppliers add column business_activity text;
alter table public.suppliers add column address text;
insert into public.permissions(key,module,description) values
 ('finance.payment_requests.view_own','finance','Consultar solicitudes propias'),
 ('finance.reports.view','finance','Consultar reportes financieros'),
 ('finance.reports.export','finance','Exportar reportes financieros')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (p.key='finance.payment_requests.view_own' and r.key in('superadmin','general_manager','area_manager','finance_manager','administrator','worker'))
 or (p.key in('finance.reports.view','finance.reports.export') and r.key in('superadmin','general_manager','area_manager','finance_manager'))
on conflict do nothing;
commit;
