\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f501'
\set clerk_id '00000000-0000-4000-8000-00000000f502'
\set driver_id '00000000-0000-4000-8000-00000000f503'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','void-admin@local.test','x',now(),now(),now()),
(:'clerk_id','authenticated','authenticated','void-clerk@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','void-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Anulacion','void-admin@local.test','Administrador',:'admin_id'),
(:'clerk_id',(select id from public.roles where key='administrative'),'Administrativo','Anulacion','void-clerk@local.test','Administrativo',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Anulacion','void-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'clerk_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f501","role":"authenticated"}',true);
select id as product_a from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1 \gset
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',id,1000,current_date,'Precio prueba',:'admin_id' from public.dist_products where business_unit_id=:'unit_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Anulacion','Av. Anulacion 1','+56944444444',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f502","role":"authenticated"}',true);
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Anulacion 1','customer_phone','+56944444444','payment_method','credit','payment_condition','credit','priority','normal','notes','x','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',2)))) as order_a \gset
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Anulacion 1','customer_phone','+56944444444','payment_method','credit','payment_condition','credit','priority','normal','notes','x','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',1)))) as order_b \gset

-- El Administrativo no puede anular directamente.
select set_config('app.a',:'order_a',true);
do $$begin
 begin
  perform public.dist_void_order(current_setting('app.a',true)::uuid,'Intento directo');
  raise exception 'El Administrativo pudo anular directamente';
 exception when others then
  if sqlerrm='El Administrativo pudo anular directamente' then raise; end if;
 end;
end$$;

-- El Administrativo solicita la anulación con motivo obligatorio.
do $$begin
 begin
  perform public.dist_request_order_change(current_setting('app.a',true)::uuid,'void','a',null);
  raise exception 'Se aceptó un motivo demasiado corto';
 exception when others then
  if sqlerrm='Se aceptó un motivo demasiado corto' then raise; end if;
 end;
end$$;
select public.dist_request_order_change(:'order_a','void','El cliente canceló el pedido',null) as request_id \gset
select set_config('app.request',:'request_id',true);

-- El Administrador aprueba: el pedido queda anulado.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f501","role":"authenticated"}',true);
select public.dist_review_order_change(:'request_id','approved','Aprobado');
do $$begin
 if (select status from public.dist_orders where id=current_setting('app.a',true)::uuid)<>'voided' then
  raise exception 'La aprobación no anuló el pedido';
 end if;
 if (select payment_status from public.dist_orders where id=current_setting('app.a',true)::uuid)<>'voided' then
  raise exception 'El estado de pago no quedó anulado';
 end if;
end$$;

-- El Administrador también anula directamente sin pasar por solicitud.
select set_config('app.b',:'order_b',true);
select public.dist_void_order(:'order_b','Error de digitación en el pedido');
do $$begin
 if (select status from public.dist_orders where id=current_setting('app.b',true)::uuid)<>'voided' then
  raise exception 'La anulación directa del Administrador no aplicó';
 end if;
 if (select void_reason from public.dist_orders where id=current_setting('app.b',true)::uuid)<>'Error de digitación en el pedido' then
  raise exception 'El motivo de anulación no quedó registrado';
 end if;
end$$;

-- Un pedido ya en ruta no admite anulación directa ni solicitud.
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Anulacion 1','customer_phone','+56944444444','payment_method','cash','payment_condition','cash','priority','normal','notes','x','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',1)))) as order_c \gset
select public.dist_assign_order(:'order_c',:'driver_id');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f503","role":"authenticated"}',true);
select public.dist_change_order_status(:'order_c','en_route','{}');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f501","role":"authenticated"}',true);
select set_config('app.c',:'order_c',true);
do $$begin
 begin
  perform public.dist_void_order(current_setting('app.c',true)::uuid,'No debería aplicar');
  raise exception 'Se anuló un pedido en ruta';
 exception when others then
  if sqlerrm='Se anuló un pedido en ruta' then raise; end if;
 end;
end$$;

reset role;
rollback;
\echo 'OK: anulación directa del Administrador y solicitud del Administrativo verificadas.'
