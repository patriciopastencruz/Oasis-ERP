\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f501'
\set clerk_id '00000000-0000-4000-8000-00000000f502'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','direct-admin@local.test','x',now(),now(),now()),
(:'clerk_id','authenticated','authenticated','direct-clerk@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Directo','direct-admin@local.test','Administrador',:'admin_id'),
(:'clerk_id',(select id from public.roles where key='administrative'),'Ana','Administrativa','direct-clerk@local.test','Administrativo',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'clerk_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f501","role":"authenticated"}',true);
select id as product_a from public.dist_products where business_unit_id=:'unit_id' order by display_order limit 1 \gset
select id as product_b from public.dist_products where business_unit_id=:'unit_id' order by display_order offset 1 limit 1 \gset
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',id,1000,current_date,'Precio prueba',:'admin_id' from public.dist_products where business_unit_id=:'unit_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,created_by)
select :'company_id',:'unit_id','Cliente Directo','Av. Original 1','+56933333366',id,:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f502","role":"authenticated"}',true);
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date',current_date,'customer_id',:'customer_id','delivery_address','Av. Original 1','customer_phone','+56933333366','payment_method','cash','payment_condition','cash','priority','normal','notes','Original','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',2)))) as order_id \gset
select set_config('app.order',:'order_id',true);

-- El Administrativo edita directamente (productos, cantidades, dirección) sin solicitud.
select public.dist_update_order(:'order_id',jsonb_build_object('delivery_date',current_date,'delivery_address','Av. Nueva 2','notes','Editado directo',
 'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',3),jsonb_build_object('product_id',:'product_b','quantity',1))));

do $$begin
 if (select delivery_address from public.dist_orders where id=current_setting('app.order',true)::uuid)<>'Av. Nueva 2' then raise exception 'La dirección no se actualizó directamente'; end if;
 if (select total from public.dist_orders where id=current_setting('app.order',true)::uuid)<>4000 then raise exception 'El total no se recalculó (esperado 4000)'; end if;
 if exists(select 1 from public.dist_change_requests where order_id=current_setting('app.order',true)::uuid) then raise exception 'La edición directa no debe crear solicitudes'; end if;
 if not exists(select 1 from public.dist_order_status_history where order_id=current_setting('app.order',true)::uuid and metadata->>'event'='order_edited') then raise exception 'No quedó trazabilidad de la edición'; end if;
end$$;

-- El Administrador recibe la notificación; quien editó no se notifica a sí mismo.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f501","role":"authenticated"}',true);
do $$begin
 if not exists(select 1 from public.notifications where recipient_id='00000000-0000-4000-8000-00000000f501' and event_key='distribution.order_changed' and entity_id=current_setting('app.order',true)::uuid) then raise exception 'El Administrador no fue notificado'; end if;
 if exists(select 1 from public.notifications where recipient_id='00000000-0000-4000-8000-00000000f502' and event_key='distribution.order_changed') then raise exception 'El editor no debe notificarse a sí mismo'; end if;
end$$;

-- Lo demás sigue restringido: sin dist_update_order no se edita por UPDATE directo, y la anulación exige solicitud.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f502","role":"authenticated"}',true);
do $$begin
 begin
  update public.dist_orders set delivery_address='Intento directo' where id=current_setting('app.order',true)::uuid;
  raise exception 'El Administrativo pudo editar por UPDATE directo';
 exception when others then
  if sqlerrm='El Administrativo pudo editar por UPDATE directo' then raise; end if;
 end;
 begin
  perform public.dist_void_order(current_setting('app.order',true)::uuid,'Anulación directa no permitida');
  raise exception 'El Administrativo pudo anular sin autorización';
 exception when others then
  if sqlerrm='El Administrativo pudo anular sin autorización' then raise; end if;
 end;
end$$;
select public.dist_request_order_change(:'order_id','void','Cliente canceló') as void_request \gset
do $$begin
 if (select status from public.dist_orders where id=current_setting('app.order',true)::uuid)='voided' then raise exception 'La anulación se aplicó sin autorización'; end if;
end$$;
reset role;
select 'OK: el Administrativo edita pedidos directo con notificación; anulación sigue exigiendo autorización.' as resultado;
rollback;
