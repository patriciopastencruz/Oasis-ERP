\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f001'
\set clerk_id '00000000-0000-4000-8000-00000000f002'
\set driver_id '00000000-0000-4000-8000-00000000f003'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','dist-admin@local.test','x',now(),now(),now()),
(:'clerk_id','authenticated','authenticated','dist-clerk@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','dist-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Distribuidora','dist-admin@local.test','Administrador',:'admin_id'),
(:'clerk_id',(select id from public.roles where key='administrative'),'Administrativo','Distribuidora','dist-clerk@local.test','Administrativo',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Uno','dist-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'clerk_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f001","role":"authenticated"}',true);
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',id,1000,current_date,'Precio prueba',:'admin_id' from public.dist_products where business_unit_id=:'unit_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Prueba','Av. Prueba 123','+56911111111',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f002","role":"authenticated"}',true);
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Prueba 123','customer_phone','+56911111111','payment_method','credit','payment_condition','credit','priority','normal','notes','Prueba','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',(select id from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1),'quantity',2)))) as order_id \gset
select set_config('app.test_order',:'order_id',true),set_config('app.test_unit',:'unit_id',true);
do $$begin if (select total from public.dist_orders where id=current_setting('app.test_order')::uuid)<>2000 then raise exception 'Total servidor incorrecto';end if;end$$;
do $$begin
 update public.dist_orders set total=1 where id=current_setting('app.test_order')::uuid;
 raise exception 'Administrativo pudo editar pedido';
exception when others then
 if sqlerrm='Administrativo pudo editar pedido' then raise;end if;
 if sqlerrm not ilike '%no puede editar%' then raise;end if;
end$$;
select public.dist_request_order_change(:'order_id','void','Cliente canceló',null);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f001","role":"authenticated"}',true);
select public.dist_assign_order(:'order_id',:'driver_id');
do $$begin if not exists(select 1 from public.dist_orders where id=current_setting('app.test_order')::uuid and driver_id='00000000-0000-4000-8000-00000000f003' and route_position=1 and status='assigned') then raise exception 'Asignación falló';end if;end$$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f003","role":"authenticated"}',true);
select public.dist_change_order_status(:'order_id','en_route','{}');
select public.dist_change_order_status(:'order_id','delivered','{}');
select public.dist_register_payment(:'order_id',1000,'cash','','Abono','test-payment-1');
do $$begin if (select payment_status from public.dist_orders where id=current_setting('app.test_order')::uuid)<>'partial' then raise exception 'Pago parcial no aplicado';end if;end$$;
do $$begin perform public.dist_register_payment(current_setting('app.test_order')::uuid,1500,'cash','','Exceso','test-payment-2');raise exception 'Sobrepago aceptado';exception when others then if sqlerrm='Sobrepago aceptado' then raise;end if;end$$;

reset role;
do $$begin
 if not exists(select 1 from public.audit_logs where entity_type='dist_orders' and entity_id=current_setting('app.test_order')::uuid) then raise exception 'Sin auditoría';end if;
 if (select (public.dist_daily_summary(current_setting('app.test_unit')::uuid,current_date)->>'ice_kg')::numeric)<=0 then raise exception 'Kilos de hielo incorrectos';end if;
end$$;
rollback;
\echo 'OK: clientes, pedido, permisos, asignación, entrega, cobro, cierre y auditoría verificados.'
