\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f201'
\set clerk_id '00000000-0000-4000-8000-00000000f202'
\set driver_id '00000000-0000-4000-8000-00000000f203'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','consumption-admin@local.test','x',now(),now(),now()),
(:'clerk_id','authenticated','authenticated','consumption-clerk@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','consumption-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Consumo','consumption-admin@local.test','Administrador',:'admin_id'),
(:'clerk_id',(select id from public.roles where key='administrative'),'Administrativo','Consumo','consumption-clerk@local.test','Administrativo',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Consumo','consumption-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'clerk_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f201","role":"authenticated"}',true);
select public.ensure_distribution_stock_catalog(:'unit_id');
select set_config('app.unit',:'unit_id',true);

do $$begin
 if (select count(*) from public.dist_products where business_unit_id=current_setting('app.unit',true)::uuid and material_id is null)<>0 then
  raise exception 'Quedaron productos sin materia prima vinculada';
 end if;
end$$;

select id as product_id, material_id from public.dist_products
where business_unit_id=:'unit_id' and code='ICE-1KG' \gset
select current_stock as stock_before from public.inventory_materials where id=:'material_id' \gset

insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
values(:'company_id',:'unit_id',:'product_id',1000,current_date,'Precio prueba',:'admin_id');
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Consumo','Av. Prueba 456','+56922222222',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f202","role":"authenticated"}',true);
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Prueba 456','customer_phone','+56922222222','payment_method','credit','payment_condition','credit','priority','normal','notes','Prueba consumo','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_id','quantity',4)))) as order_id \gset
select set_config('app.test_order',:'order_id',true);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f201","role":"authenticated"}',true);
select public.dist_assign_order(:'order_id',:'driver_id');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f203","role":"authenticated"}',true);
select public.dist_change_order_status(:'order_id','en_route','{}');
select public.dist_change_order_status(:'order_id','delivered','{}');

select set_config('app.material',:'material_id',true);
select set_config('app.stock_before',:'stock_before',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f201","role":"authenticated"}',true);

do $$begin
 if (select current_stock from public.inventory_materials where id=current_setting('app.material',true)::uuid)
    <>(current_setting('app.stock_before',true)::numeric-4) then
  raise exception 'El stock de materia prima no se descontó en 4 unidades';
 end if;
 if not exists(select 1 from public.inventory_movements where material_id=current_setting('app.material',true)::uuid
    and movement_type='operational_consumption' and quantity_out=4
    and document_reference=(select order_number from public.dist_orders where id=current_setting('app.test_order',true)::uuid)) then
  raise exception 'No se registró el movimiento de consumo automático';
 end if;
 if (select materials_consumed_at from public.dist_orders where id=current_setting('app.test_order',true)::uuid) is null then
  raise exception 'El pedido no quedó marcado como consumido';
 end if;
end$$;

-- Reintentar el consumo del mismo pedido no debe volver a descontar stock (idempotencia).
select public.dist_consume_order_materials(current_setting('app.test_order',true)::uuid);
do $$begin
 if (select current_stock from public.inventory_materials where id=current_setting('app.material',true)::uuid)
    <>(current_setting('app.stock_before',true)::numeric-4) then
  raise exception 'El consumo automático no fue idempotente';
 end if;
 if (select count(*) from public.inventory_movements where material_id=current_setting('app.material',true)::uuid and movement_type='operational_consumption')<>1 then
  raise exception 'Se duplicó el movimiento de consumo';
 end if;
end$$;

reset role;
rollback;
\echo 'OK: vínculo producto-materia prima y descuento automático por entrega verificados.'
