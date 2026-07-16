\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f801'
\set driver_id '00000000-0000-4000-8000-00000000f802'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','stock-admin@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','stock-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Stock','stock-admin@local.test','Administrador',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Stock','stock-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f801","role":"authenticated"}',true);

-- Genera el catálogo de materia prima (queda en stock 0, sin compras registradas).
select public.ensure_distribution_stock_catalog(:'unit_id');
select id as product_a from public.dist_products where business_unit_id=:'unit_id' and code='ICE-1KG' \gset
select material_id as material_a from public.dist_products where id=:'product_a' \gset
select set_config('app.material_a',:'material_a',true);

insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',:'product_a',1000,current_date,'Precio prueba',:'admin_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Stock','Av. Stock 1','+56933333366',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

-- Dos pedidos que consumen stock partiendo de 0 (queda negativo desde la primera entrega).
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Stock 1','customer_phone','+56933333366','payment_method','cash','payment_condition','cash','priority','normal','notes','Stock 1','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',2)))) as order_a_id \gset
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Stock 1','customer_phone','+56933333366','payment_method','cash','payment_condition','cash','priority','normal','notes','Stock 2','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',1)))) as order_b_id \gset
select public.dist_assign_order(:'order_a_id',:'driver_id');
select public.dist_assign_order(:'order_b_id',:'driver_id');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f802","role":"authenticated"}',true);
-- Primera entrega: deja el stock del material en -2 (0 disponible - 2 consumidos), señal intencional de compra pendiente.
select public.dist_change_order_status(:'order_a_id','en_route','{}');
select public.dist_change_order_status(:'order_a_id','delivered',jsonb_build_object('payment_method','cash'));
do $$begin
 if (select current_stock from public.inventory_materials where id=current_setting('app.material_a',true)::uuid)<>-2 then
  raise exception 'El stock tras la primera entrega no quedó en -2';
 end if;
end$$;

-- Segunda entrega con el material ya en negativo: antes de este fix fallaba con
-- "inventory_movements_stock_before_check"; ahora debe completarse sin error.
select public.dist_change_order_status(:'order_b_id','en_route','{}');
select public.dist_change_order_status(:'order_b_id','delivered',jsonb_build_object('payment_method','cash'));
do $$begin
 if (select current_stock from public.inventory_materials where id=current_setting('app.material_a',true)::uuid)<>-3 then
  raise exception 'El stock tras la segunda entrega no quedó en -3';
 end if;
end$$;

reset role;
rollback;
\echo 'OK: consumo automático de materia prima ya no bloquea entregas con stock negativo.'
