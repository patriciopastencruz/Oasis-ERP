\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f601'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','price-tiebreak-admin@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Precio','price-tiebreak-admin@local.test','Administrador',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f601","role":"authenticated"}',true);
select id as product_id from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1 \gset
insert into public.dist_customer_classifications(company_id,business_unit_id,code,name)
values(:'company_id',:'unit_id','tiebreak_test','Prueba desempate')
on conflict(business_unit_id,code) do update set name=excluded.name returning id as classification_id \gset
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
values(:'company_id',:'unit_id','Cliente Desempate','Av. Desempate 1','+56955555555',:'classification_id',false,0,0,'suspended',:'admin_id')
returning id as customer_id \gset

-- Dos precios del mismo cliente y producto, misma fecha de vigencia (hoy),
-- insertados con created_at explícito para simular una carga inicial
-- (más antigua) y una corrección posterior (más reciente), en cualquier
-- orden de inserción física.
insert into public.dist_prices(company_id,business_unit_id,product_id,customer_id,amount,valid_from,active,change_reason,created_at,created_by)
values(:'company_id',:'unit_id',:'product_id',:'customer_id',559,current_date,true,'Carga inicial','2026-07-15 08:00:00-04',:'admin_id');
insert into public.dist_prices(company_id,business_unit_id,product_id,customer_id,amount,valid_from,active,change_reason,created_at,created_by)
values(:'company_id',:'unit_id',:'product_id',:'customer_id',400,current_date,true,'Corrección comercial','2026-07-15 09:00:00-04',:'admin_id');

select set_config('app.product',:'product_id',true),set_config('app.customer',:'customer_id',true);
do $$
declare resolved record;
begin
 select * into resolved from public.dist_resolve_price(current_setting('app.product',true)::uuid,current_setting('app.customer',true)::uuid,current_date);
 if resolved.amount<>400 then
  raise exception 'Se resolvió % en vez del precio corregido más reciente (400)',resolved.amount;
 end if;
 if resolved.origin<>'customer' then
  raise exception 'El origen del precio no quedó como cliente';
 end if;
end$$;

-- Una tercera corrección, insertada con un created_at aún más antiguo que
-- las anteriores (fuera de orden de inserción física), no debe ganar.
insert into public.dist_prices(company_id,business_unit_id,product_id,customer_id,amount,valid_from,active,change_reason,created_at,created_by)
values(:'company_id',:'unit_id',:'product_id',:'customer_id',999,current_date,true,'Precio antiguo fuera de orden','2026-07-14 08:00:00-04',:'admin_id');
do $$
declare resolved record;
begin
 select * into resolved from public.dist_resolve_price(current_setting('app.product',true)::uuid,current_setting('app.customer',true)::uuid,current_date);
 if resolved.amount<>400 then
  raise exception 'Un precio con created_at más antiguo ganó incorrectamente: %',resolved.amount;
 end if;
end$$;

reset role;
rollback;
\echo 'OK: desempate determinístico por created_at en dist_resolve_price verificado.'
