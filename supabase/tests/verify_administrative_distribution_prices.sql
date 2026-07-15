\set ON_ERROR_STOP on
begin;

-- Confirma que el rol Administrativo puede cargar precios de clientes en
-- Distribuidora Altiplánica (dist_prices), tanto precio estándar como precio
-- específico de un cliente, tras otorgarle finance.distribution.catalogs.manage.

select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-0000000f1001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'admin_id','authenticated','authenticated','administrative-price@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='administrative'),'Prueba','Precios','administrative-price@local.test','Administrativo',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

select id as product_id from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1 \gset
select id as classification_id from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 \gset

insert into public.dist_customers(id,company_id,business_unit_id,name,address,phone,classification_id,created_by)
values('00000000-0000-4000-8000-0000000f1101',:'company_id',:'unit_id','Cliente Precio Administrativo','Av. Precio 1','+56900000001',:'classification_id',:'admin_id');

-- Precio estándar (sin cliente asociado).
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
values(:'company_id',:'unit_id',:'product_id',777,current_date,'Prueba precio estándar administrativo',:'admin_id');

-- Precio específico de cliente.
insert into public.dist_prices(company_id,business_unit_id,product_id,customer_id,amount,valid_from,change_reason,created_by)
values(:'company_id',:'unit_id',:'product_id','00000000-0000-4000-8000-0000000f1101',888,current_date,'Prueba precio cliente administrativo',:'admin_id');

do $$
declare
  standard_amount numeric;
  customer_amount numeric;
begin
  select amount into standard_amount from public.dist_prices where customer_id is null and change_reason='Prueba precio estándar administrativo';
  select amount into customer_amount from public.dist_prices where customer_id='00000000-0000-4000-8000-0000000f1101' and change_reason='Prueba precio cliente administrativo';
  if standard_amount <> 777 then raise exception 'El Administrativo no pudo cargar el precio estándar'; end if;
  if customer_amount <> 888 then raise exception 'El Administrativo no pudo cargar el precio específico de cliente'; end if;
  raise notice 'El Administrativo pudo cargar precio estándar (%) y de cliente (%)', standard_amount, customer_amount;
end $$;

rollback;
