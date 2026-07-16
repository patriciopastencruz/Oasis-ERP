\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000fa01'
\set driver_id '00000000-0000-4000-8000-00000000fa02'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','period-admin@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','period-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Periodo','period-admin@local.test','Administrador',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Periodo','period-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000fa01","role":"authenticated"}',true);
select id as product_a from public.dist_products where business_unit_id=:'unit_id' and code='ICE-1KG' \gset
insert into public.dist_prices(company_id,business_unit_id,product_id,amount,valid_from,change_reason,created_by)
select :'company_id',:'unit_id',:'product_a',1000,'2026-01-01','Precio prueba',:'admin_id';
insert into public.dist_customers(company_id,business_unit_id,name,address,phone,classification_id,has_credit,credit_limit,credit_days,credit_status,created_by)
select :'company_id',:'unit_id','Cliente Periodo','Av. Periodo 1','+56933333377',id,true,100000,30,'current',:'admin_id' from public.dist_customer_classifications where business_unit_id=:'unit_id' limit 1 returning id as customer_id \gset

-- Pedido de contado entregado el lunes de la semana de prueba.
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date','2026-03-02','customer_id',:'customer_id','delivery_address','Av. Periodo 1','customer_phone','+56933333377','payment_method','cash','payment_condition','cash','priority','normal','notes','Lunes','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',3)))) as monday_order_id \gset
select public.dist_assign_order(:'monday_order_id',:'driver_id');
-- Pedido de contado entregado el miércoles de la misma semana.
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date','2026-03-04','customer_id',:'customer_id','delivery_address','Av. Periodo 1','customer_phone','+56933333377','payment_method','cash','payment_condition','cash','priority','normal','notes','Miercoles','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',2)))) as wednesday_order_id \gset
select public.dist_assign_order(:'wednesday_order_id',:'driver_id');
-- Pedido a crédito entregado el mismo miércoles, pagado solo parcialmente (queda deuda vigente).
select public.dist_create_order(jsonb_build_object('business_unit_id',:'unit_id','delivery_date','2026-03-04','customer_id',:'customer_id','delivery_address','Av. Periodo 1','customer_phone','+56933333377','payment_method','credit','payment_condition','credit','priority','normal','notes','Credito','route_sale',false,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product_a','quantity',5)))) as credit_order_id \gset
select public.dist_assign_order(:'credit_order_id',:'driver_id');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000fa02","role":"authenticated"}',true);
select public.dist_change_order_status(:'monday_order_id','en_route','{}');
select public.dist_change_order_status(:'monday_order_id','delivered',jsonb_build_object('payment_method','cash'));
select public.dist_change_order_status(:'wednesday_order_id','en_route','{}');
select public.dist_change_order_status(:'wednesday_order_id','delivered',jsonb_build_object('payment_method','cash'));
select public.dist_change_order_status(:'credit_order_id','en_route','{}');
select public.dist_change_order_status(:'credit_order_id','delivered','{}');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000fa01","role":"authenticated"}',true);
select public.dist_register_payment(:'credit_order_id',2000,'cash','','Abono parcial',gen_random_uuid()::text);

-- Semana completa lunes 02 a domingo 08 de marzo de 2026: total esperado 3000+2000+5000=10000, 10 kg (10 bolsas de 1kg), 10 unidades.
select public.dist_period_summary(:'unit_id','2026-03-02','2026-03-08') as summary \gset
select set_config('app.summary',:'summary',true);
do $$declare s jsonb;begin
 s:=current_setting('app.summary',true)::jsonb;
 if (s->>'days')::int<>7 then raise exception 'La cantidad de días no es 7 (fue %)',(s->>'days'); end if;
 if (s->>'delivered_sales')::numeric<>10000 then raise exception 'Venta entregada esperada 10000, fue %',(s->>'delivered_sales'); end if;
 if (s->>'total_kg')::numeric<>10 then raise exception 'Kilos esperados 10, fueron %',(s->>'total_kg'); end if;
 if (s->>'total_units')::numeric<>10 then raise exception 'Unidades esperadas 10, fueron %',(s->>'total_units'); end if;
 if (s->>'outstanding_credit')::numeric<>3000 then raise exception 'Deuda a crédito esperada 3000, fue %',(s->>'outstanding_credit'); end if;
 if jsonb_array_length(s->'daily')<>7 then raise exception 'La serie diaria no tiene 7 días (tiene %)',jsonb_array_length(s->'daily'); end if;
 if not exists(select 1 from jsonb_array_elements(s->'daily') d where (d->>'date')='2026-03-02' and (d->>'sales')::numeric=3000) then
  raise exception 'El lunes no quedó con 3000 en la serie diaria';
 end if;
 if not exists(select 1 from jsonb_array_elements(s->'daily') d where (d->>'date')='2026-03-04' and (d->>'sales')::numeric=7000) then
  raise exception 'El miércoles no quedó con 7000 en la serie diaria';
 end if;
 if not exists(select 1 from jsonb_array_elements(s->'daily') d where (d->>'date')='2026-03-05' and (d->>'sales')::numeric=0) then
  raise exception 'Un día sin ventas no quedó en 0 en la serie diaria';
 end if;
end$$;

-- La deuda a crédito vigente no cambia aunque se consulte un rango distinto (sin ventas nuevas).
select public.dist_period_summary(:'unit_id','2026-01-01','2026-01-07') as empty_summary \gset
select set_config('app.empty_summary',:'empty_summary',true);
do $$declare s jsonb;begin
 s:=current_setting('app.empty_summary',true)::jsonb;
 if (s->>'outstanding_credit')::numeric<>3000 then raise exception 'La deuda a crédito debería ser la misma (3000) en cualquier rango, fue %',(s->>'outstanding_credit'); end if;
 if (s->>'delivered_sales')::numeric<>0 then raise exception 'Un rango sin pedidos debería tener venta 0, fue %',(s->>'delivered_sales'); end if;
end$$;

-- Un rango inválido (desde después de hasta) debe fallar.
do $$begin
 begin
  perform public.dist_period_summary(current_setting('app.unused',true)::uuid,'2026-03-08','2026-03-02');
 exception when others then
  if sqlerrm<>'Rango de fechas inválido' then raise; end if;
 end;
end$$;

reset role;
rollback;
\echo 'OK: reporte por período de Distribuidora Altiplánica verificado (totales, serie diaria, deuda vigente y validación de rango).'
