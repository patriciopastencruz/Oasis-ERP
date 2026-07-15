\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f601'
\set driver_id '00000000-0000-4000-8000-00000000f602'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','pay-admin@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','pay-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Cobro','pay-admin@local.test','Administrador',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Cobro','pay-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f601","role":"authenticated"}',true);
select id as product_a from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1 \gset
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',id,1000,current_date,'Precio prueba',:'admin_id' from public.dist_products where business_unit_id=:'unit_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Cobro','Av. Cobro 1','+56933333344',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

-- Pedido de contado: no debe poder marcarse entregado sin indicar el medio de pago.
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Cobro 1','customer_phone','+56933333344','payment_method','cash','payment_condition','cash','priority','normal','notes','Contado','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',2)))) as cash_order_id \gset
select set_config('app.cash_order',:'cash_order_id',true);
select public.dist_assign_order(:'cash_order_id',:'driver_id');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f602","role":"authenticated"}',true);
select public.dist_change_order_status(:'cash_order_id','en_route','{}');
do $$begin
 begin
  perform public.dist_change_order_status(current_setting('app.cash_order',true)::uuid,'delivered','{}');
  raise exception 'Se entregó sin exigir el medio de pago';
 exception when others then
  if sqlerrm='Se entregó sin exigir el medio de pago' then raise; end if;
 end;
end$$;

-- Con el medio de pago indicado, el pedido queda pagado automáticamente.
select public.dist_change_order_status(:'cash_order_id','delivered',jsonb_build_object('payment_method','cash'));
do $$declare status text; paid numeric;begin
 select payment_status into status from public.dist_orders where id=current_setting('app.cash_order',true)::uuid;
 if status<>'paid' then raise exception 'El pedido de contado no quedó pagado (estado: %)',status; end if;
 select coalesce(sum(amount),0) into paid from public.dist_payments where idempotency_key='delivery:'||current_setting('app.cash_order',true)::uuid::text;
 if paid<>2000 then raise exception 'El cobro automático no registró el monto esperado (2000), fue %',paid; end if;
end$$;

-- Pedido a crédito: sigue entregándose sin exigir medio de pago ni registrar cobro.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f601","role":"authenticated"}',true);
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Cobro 1','customer_phone','+56933333344','payment_method','credit','payment_condition','credit','priority','normal','notes','Credito','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',1)))) as credit_order_id \gset
select set_config('app.credit_order',:'credit_order_id',true);
select public.dist_assign_order(:'credit_order_id',:'driver_id');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f602","role":"authenticated"}',true);
select public.dist_change_order_status(:'credit_order_id','en_route','{}');
select public.dist_change_order_status(:'credit_order_id','delivered','{}');
do $$declare status text;begin
 select payment_status into status from public.dist_orders where id=current_setting('app.credit_order',true)::uuid;
 if status<>'credit' then raise exception 'El pedido a crédito no debía cambiar de estado de pago (estado: %)',status; end if;
end$$;

reset role;
rollback;
\echo 'OK: cobro automático al entregar pedidos de contado verificado.'
