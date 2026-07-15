\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f401'
\set clerk_id '00000000-0000-4000-8000-00000000f402'
\set driver_id '00000000-0000-4000-8000-00000000f403'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','edit-admin@local.test','x',now(),now(),now()),
(:'clerk_id','authenticated','authenticated','edit-clerk@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','edit-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Edicion','edit-admin@local.test','Administrador',:'admin_id'),
(:'clerk_id',(select id from public.roles where key='administrative'),'Administrativo','Edicion','edit-clerk@local.test','Administrativo',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Edicion','edit-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'clerk_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f401","role":"authenticated"}',true);
select id as product_a from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1 \gset
select id as product_b from public.dist_products where business_unit_id=:'unit_id' order by display_order offset 1 limit 1 \gset
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',id,1000,current_date,'Precio prueba',:'admin_id' from public.dist_products where business_unit_id=:'unit_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Edicion','Av. Original 1','+56933333333',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f402","role":"authenticated"}',true);
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Original 1','customer_phone','+56933333333','payment_method','credit','payment_condition','credit','priority','normal','notes','Original','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',2)))) as order_id \gset

-- El Administrativo no puede editar directamente el pedido guardado.
select set_config('app.order',:'order_id',true);
do $$begin
 begin
  update public.dist_orders set delivery_address='Intento directo' where id=current_setting('app.order',true)::uuid;
  raise exception 'El Administrativo pudo editar directamente';
 exception when others then
  if sqlerrm='El Administrativo pudo editar directamente' then raise; end if;
 end;
end$$;

-- El Administrativo solicita la edición con productos y cantidades nuevas.
select public.dist_request_order_change(:'order_id','edit','Cliente pidió más hielo',
 jsonb_build_object('delivery_date',current_date,'delivery_address','Av. Nueva 2','notes','Actualizado',
  'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',3),jsonb_build_object('product_id',:'product_b','quantity',1))
 )) as request_id \gset
select set_config('app.request',:'request_id',true);

-- El Administrador aprueba: el pedido queda con los nuevos productos y total recalculado.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f401","role":"authenticated"}',true);
select public.dist_review_order_change(:'request_id','approved','Aprobado, stock disponible');

do $$begin
 if (select delivery_address from public.dist_orders where id=current_setting('app.order',true)::uuid)<>'Av. Nueva 2' then
  raise exception 'La dirección no se actualizó';
 end if;
 if (select total from public.dist_orders where id=current_setting('app.order',true)::uuid)<>4000 then
  raise exception 'El total no se recalculó (esperado 4000)';
 end if;
 if (select count(*) from public.dist_order_lines where order_id=current_setting('app.order',true)::uuid)<>2 then
  raise exception 'Las líneas del pedido no se reemplazaron';
 end if;
 if (select status from public.dist_change_requests where id=current_setting('app.request',true)::uuid)<>'approved' then
  raise exception 'La solicitud no quedó aprobada';
 end if;
end$$;

-- El Administrador también puede editar directamente, sin pasar por solicitud.
select public.dist_update_order(current_setting('app.order',true)::uuid, jsonb_build_object(
 'delivery_date',current_date,'delivery_address','Av. Nueva 2','notes','Ajuste directo',
 'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',5))
));
do $$begin
 if (select total from public.dist_orders where id=current_setting('app.order',true)::uuid)<>5000 then
  raise exception 'La edición directa del Administrador no recalculó el total';
 end if;
end$$;

-- Un pedido entregado ya no admite edición ni solicitud.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f401","role":"authenticated"}',true);
select public.dist_assign_order(current_setting('app.order',true)::uuid,:'driver_id');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f403","role":"authenticated"}',true);
select public.dist_change_order_status(current_setting('app.order',true)::uuid,'en_route','{}');
select public.dist_change_order_status(current_setting('app.order',true)::uuid,'delivered','{}');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f401","role":"authenticated"}',true);
do $$begin
 begin
  perform public.dist_update_order(current_setting('app.order',true)::uuid, jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('product_id',current_setting('app.order',true)::uuid,'quantity',1))));
  raise exception 'Se editó un pedido entregado';
 exception when others then
  if sqlerrm='Se editó un pedido entregado' then raise; end if;
 end;
end$$;

reset role;
rollback;
\echo 'OK: edición directa del Administrador y solicitud del Administrativo verificadas.'
