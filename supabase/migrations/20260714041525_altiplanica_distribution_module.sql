begin;

-- Distribuidora Altiplanica: dominio comercial, logistica y cobranza.
-- La unidad DA ya existe. Esta migracion no crea ni reasigna unidades.
insert into public.roles(key,name,description,is_system) values
  ('operations_manager','Gerente de Operaciones','Supervision integral de operaciones',true),
  ('administrative','Administrativo','Planificacion, clientes y cobranzas',true),
  ('driver','Chofer','Entregas y ventas en ruta',true)
on conflict(key) do update set name=excluded.name,description=excluded.description,active=true;

insert into public.permissions(key,module,description) values
  ('finance.distribution.view','finance','Ver operacion de Distribuidora Altiplanica'),
  ('finance.distribution.customers.manage','finance','Administrar clientes y condiciones de credito'),
  ('finance.distribution.catalogs.manage','finance','Administrar productos, clasificaciones y precios'),
  ('finance.distribution.orders.create','finance','Crear pedidos planificados'),
  ('finance.distribution.orders.manage','finance','Editar y anular pedidos'),
  ('finance.distribution.routes.manage','finance','Asignar choferes y ordenar rutas'),
  ('finance.distribution.requests.create','finance','Solicitar edicion o anulacion'),
  ('finance.distribution.requests.review','finance','Aprobar o rechazar solicitudes'),
  ('finance.distribution.driver','finance','Operar ruta propia desde celular'),
  ('finance.distribution.payments.manage','finance','Registrar y aplicar cobros'),
  ('finance.distribution.closures.manage','finance','Revisar y cerrar jornadas'),
  ('finance.distribution.reports.view','finance','Consultar reportes y estados de pago'),
  ('finance.distribution.reports.export','finance','Exportar reportes y estados de pago'),
  ('finance.distribution.audit.view','finance','Consultar auditoria del modulo')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('superadmin','general_manager','operations_manager') and p.key like 'finance.distribution.%'
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in (
 'finance.distribution.view','finance.distribution.customers.manage','finance.distribution.catalogs.manage',
 'finance.distribution.orders.create','finance.distribution.orders.manage','finance.distribution.routes.manage',
 'finance.distribution.requests.review','finance.distribution.payments.manage','finance.distribution.closures.manage',
 'finance.distribution.reports.view','finance.distribution.reports.export','finance.distribution.audit.view')
where r.key='administrator' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in (
 'finance.distribution.view','finance.distribution.customers.manage','finance.distribution.orders.create',
 'finance.distribution.routes.manage','finance.distribution.requests.create','finance.distribution.payments.manage',
 'finance.distribution.reports.view') where r.key='administrative' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
 ('finance.distribution.view','finance.distribution.driver') where r.key='driver' on conflict do nothing;

create table public.dist_customer_classifications(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), business_unit_id uuid not null,
 code text not null, name text not null, active boolean not null default true, display_order integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users(id),updated_by uuid references auth.users(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id), unique(business_unit_id,code),unique(business_unit_id,name)
);
create table public.dist_customer_sequences(
 business_unit_id uuid primary key references public.business_units(id) on delete cascade,last_value bigint not null default 0
);
create table public.dist_customers(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 code text not null,name text not null,legal_name text,address text not null,address_reference text,phone text not null,contact_name text,email text,
 classification_id uuid not null references public.dist_customer_classifications(id),latitude numeric(10,7),longitude numeric(10,7),notes text,
 status text not null default 'active' check(status in('active','inactive','suspended')),has_credit boolean not null default false,
 credit_limit numeric(14,2) not null default 0 check(credit_limit>=0),credit_days integer not null default 0 check(credit_days between 0 and 365),
 credit_status text not null default 'suspended' check(credit_status in('current','suspended')),commercial_block boolean not null default false,credit_notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users(id),updated_by uuid references auth.users(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,code),
 check(has_credit or (credit_limit=0 and credit_days=0 and credit_status='suspended'))
);
create table public.dist_product_categories(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 code text not null,name text not null,active boolean not null default true,display_order integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users(id),updated_by uuid references auth.users(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,code)
);
create table public.dist_products(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 category_id uuid not null references public.dist_product_categories(id),code text not null,name text not null,presentation text not null,unit text not null default 'unit',
 conversion_factor numeric(12,3) not null default 1 check(conversion_factor>0),ice_weight_kg numeric(12,3) not null default 0 check(ice_weight_kg>=0),image_path text,
 active boolean not null default true,display_order integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id),updated_by uuid references auth.users(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,code)
);
create table public.dist_prices(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 product_id uuid not null references public.dist_products(id),customer_id uuid references public.dist_customers(id),amount numeric(14,2) not null check(amount>=0),
 valid_from date not null,valid_until date,active boolean not null default true,change_reason text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users(id),updated_by uuid references auth.users(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),check(valid_until is null or valid_until>=valid_from)
);
create table public.dist_order_sequences(
 business_unit_id uuid not null references public.business_units(id) on delete cascade,year smallint not null,last_value bigint not null default 0,primary key(business_unit_id,year)
);
create table public.dist_orders(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 order_number text not null,delivery_date date not null,estimated_time time,customer_id uuid references public.dist_customers(id),
 occasional_customer_name text,delivery_address text not null,customer_phone text,route_sale boolean not null default false,request_regular_customer boolean not null default false,
 payment_method text not null check(payment_method in('cash','transfer','credit','mixed')),payment_condition text not null check(payment_condition in('cash','credit')),
 status text not null default 'scheduled' check(status in('draft','scheduled','assigned','en_route','delivered','partially_delivered','not_delivered','rescheduled','cancelled','voided')),
 payment_status text not null default 'pending' check(payment_status in('pending','paid','partial','credit','overdue','voided')),
 driver_id uuid references public.profiles(id),route_position integer,priority text not null default 'normal' check(priority in('low','normal','high','urgent')),
 subtotal numeric(14,2) not null check(subtotal>=0),discount numeric(14,2) not null default 0 check(discount>=0),total numeric(14,2) not null check(total>=0),
 notes text,original_order_id uuid references public.dist_orders(id),actual_delivered_at timestamptz,non_delivery_reason text,non_delivery_notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid not null references auth.users(id),updated_by uuid references auth.users(id),voided_at timestamptz,voided_by uuid references auth.users(id),void_reason text,deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,order_number),
 check((route_sale and (customer_id is not null or occasional_customer_name is not null)) or (not route_sale and customer_id is not null)),
 check(customer_id is not null or payment_condition='cash'),check(customer_id is not null or payment_method<>'credit'),check(route_position is null or route_position>0)
);
create unique index dist_orders_route_position_uq on public.dist_orders(business_unit_id,delivery_date,driver_id,route_position) where driver_id is not null and route_position is not null and status not in('cancelled','voided');
create table public.dist_order_lines(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,order_id uuid not null references public.dist_orders(id) on delete restrict,
 product_id uuid not null references public.dist_products(id),planned_quantity numeric(12,3) not null check(planned_quantity>0),delivered_quantity numeric(12,3) check(delivered_quantity>=0),
 unit_price numeric(14,2) not null check(unit_price>=0),price_origin text not null check(price_origin in('standard','customer','authorized_exception')),price_id uuid references public.dist_prices(id),line_total numeric(14,2) not null check(line_total>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users(id),updated_by uuid references auth.users(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(order_id,product_id)
);
create table public.dist_order_status_history(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,order_id uuid not null references public.dist_orders(id),
 previous_status text,new_status text not null,reason text,metadata jsonb not null default '{}',changed_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create table public.dist_change_requests(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,order_id uuid not null references public.dist_orders(id),
 type text not null check(type in('edit','void')),reason text not null,current_data jsonb not null,proposed_data jsonb,status text not null default 'pending' check(status in('pending','in_review','approved','rejected','cancelled')),
 requested_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),resolution_comment text,applied_data jsonb,created_at timestamptz not null default now(),reviewed_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create table public.dist_deliveries(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,order_id uuid not null unique references public.dist_orders(id),driver_id uuid not null references public.profiles(id),
 delivered_at timestamptz not null default now(),latitude numeric(10,7),longitude numeric(10,7),notes text,evidence_path text,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create table public.dist_payments(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,customer_id uuid references public.dist_customers(id),
 paid_at timestamptz not null default now(),amount numeric(14,2) not null check(amount>0),method text not null check(method in('cash','transfer','mixed')),bank_account_id uuid,receipt_number text,notes text,attachment_path text,
 idempotency_key text not null,status text not null default 'confirmed' check(status in('confirmed','voided')),registered_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,idempotency_key)
);
create table public.dist_payment_allocations(
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.dist_payments(id),order_id uuid not null references public.dist_orders(id),amount numeric(14,2) not null check(amount>0),created_at timestamptz not null default now(),unique(payment_id,order_id)
);
create table public.dist_daily_closures(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,closure_date date not null,status text not null default 'open' check(status in('open','in_review','closed')),
 snapshot jsonb not null default '{}',reviewed_by uuid references auth.users(id),closed_by uuid references auth.users(id),closed_at timestamptz,reopened_by uuid references auth.users(id),reopened_at timestamptz,reopen_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),unique(business_unit_id,closure_date)
);

create index dist_customers_lookup_idx on public.dist_customers(business_unit_id,status,classification_id) where deleted_at is null;
create index dist_prices_lookup_idx on public.dist_prices(business_unit_id,product_id,customer_id,valid_from,valid_until) where active and deleted_at is null;
create index dist_orders_day_idx on public.dist_orders(business_unit_id,delivery_date,status,driver_id) where deleted_at is null;
create index dist_orders_customer_idx on public.dist_orders(customer_id,delivery_date desc) where deleted_at is null;
create index dist_orders_payment_idx on public.dist_orders(business_unit_id,payment_status,delivery_date) where deleted_at is null;
create index dist_change_requests_pending_idx on public.dist_change_requests(business_unit_id,status,created_at) where status in('pending','in_review');
create index dist_payments_customer_idx on public.dist_payments(customer_id,paid_at desc) where status='confirmed';

create trigger dist_classifications_updated before update on public.dist_customer_classifications for each row execute function public.set_updated_at();
create trigger dist_customers_updated before update on public.dist_customers for each row execute function public.set_updated_at();
create trigger dist_categories_updated before update on public.dist_product_categories for each row execute function public.set_updated_at();
create trigger dist_products_updated before update on public.dist_products for each row execute function public.set_updated_at();
create trigger dist_prices_updated before update on public.dist_prices for each row execute function public.set_updated_at();
create trigger dist_orders_updated before update on public.dist_orders for each row execute function public.set_updated_at();
create trigger dist_lines_updated before update on public.dist_order_lines for each row execute function public.set_updated_at();
create trigger dist_closures_updated before update on public.dist_daily_closures for each row execute function public.set_updated_at();

create or replace function public.dist_guard_order_update() returns trigger language plpgsql set search_path='' as $$
declare paid numeric;
begin
 if old.status<>new.status and not (
  (old.status='scheduled' and new.status in('assigned','cancelled','voided')) or
  (old.status='assigned' and new.status in('en_route','scheduled','cancelled','voided')) or
  (old.status='en_route' and new.status in('delivered','partially_delivered','not_delivered')) or
  (old.status='not_delivered' and new.status='rescheduled')) then
  raise exception 'Transicion de pedido no permitida: % -> %',old.status,new.status;
 end if;
 if new.payment_status is distinct from old.payment_status then
  select coalesce(sum(a.amount),0) into paid from public.dist_payment_allocations a join public.dist_payments p on p.id=a.payment_id and p.status='confirmed' where a.order_id=old.id;
  new.payment_status:=case when paid=0 then case when old.payment_condition='credit' then 'credit' else 'pending' end when paid<old.total then 'partial' else 'paid' end;
 end if;
 if public.has_permission('finance.distribution.orders.manage') then return new; end if;
 if public.has_permission('finance.distribution.routes.manage') then
  if (to_jsonb(new)-array['driver_id','route_position','status','payment_status','updated_by','updated_at'])<>(to_jsonb(old)-array['driver_id','route_position','status','payment_status','updated_by','updated_at']) then raise exception 'El Administrativo no puede editar pedidos guardados'; end if;
  if new.status<>old.status and not (old.status='scheduled' and new.status='assigned') and not (old.status='assigned' and new.status='scheduled') then raise exception 'Cambio de estado no autorizado'; end if;
  return new;
 end if;
 if public.has_permission('finance.distribution.driver') and old.driver_id=auth.uid() then
  if (to_jsonb(new)-array['status','payment_status','actual_delivered_at','non_delivery_reason','non_delivery_notes','updated_by','updated_at'])<>(to_jsonb(old)-array['status','payment_status','actual_delivered_at','non_delivery_reason','non_delivery_notes','updated_by','updated_at']) then raise exception 'El chofer no puede editar datos comerciales'; end if;
  return new;
 end if;
 raise exception 'Actualizacion de pedido no autorizada';
end $$;
create trigger dist_order_guard before update on public.dist_orders for each row execute function public.dist_guard_order_update();

create or replace function public.dist_prepare_customer() returns trigger language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 if tg_op='INSERT' then
  insert into public.dist_customer_sequences(business_unit_id,last_value) values(new.business_unit_id,1)
  on conflict(business_unit_id) do update set last_value=public.dist_customer_sequences.last_value+1 returning last_value into n;
  new.code:=format('CLI-%s',lpad(n::text,6,'0')); new.created_by:=coalesce(new.created_by,auth.uid());
 end if;
 if tg_op='UPDATE' and new.code<>old.code then raise exception 'El codigo de cliente es inmutable'; end if;
 new.updated_by:=auth.uid(); return new;
end $$;
create trigger dist_customer_prepare before insert or update on public.dist_customers for each row execute function public.dist_prepare_customer();

create or replace function public.dist_closed(target_unit uuid,target_date date) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.dist_daily_closures where business_unit_id=target_unit and closure_date=target_date and status='closed')
$$;
create or replace function public.dist_outstanding(target_customer uuid,exclude_order uuid default null) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(o.total-coalesce(a.paid,0)),0) from public.dist_orders o left join lateral
 (select sum(pa.amount) paid from public.dist_payment_allocations pa join public.dist_payments p on p.id=pa.payment_id and p.status='confirmed' where pa.order_id=o.id) a on true
 where o.customer_id=target_customer and o.payment_condition='credit' and o.status in('delivered','partially_delivered') and o.payment_status not in('paid','voided') and (exclude_order is null or o.id<>exclude_order)
$$;
create or replace function public.dist_resolve_price(target_product uuid,target_customer uuid,target_date date)
returns table(price_id uuid,amount numeric,origin text) language sql stable security invoker set search_path='' as $$
 select p.id,p.amount,case when p.customer_id is null then 'standard' else 'customer' end
 from public.dist_prices p where p.product_id=target_product and p.active and p.deleted_at is null and p.valid_from<=target_date
 and (p.valid_until is null or p.valid_until>=target_date) and (p.customer_id=target_customer or p.customer_id is null)
 order by (p.customer_id is not null) desc,p.valid_from desc limit 1
$$;
create or replace function public.dist_next_order_sequence(target_unit uuid,target_year smallint) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 insert into public.dist_order_sequences(business_unit_id,year,last_value) values(target_unit,target_year,1)
 on conflict(business_unit_id,year) do update set last_value=public.dist_order_sequences.last_value+1 returning last_value into result;
 return result;
end $$;
create or replace function public.dist_is_valid_driver(target_unit uuid,target_driver uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('finance.distribution.routes.manage') and exists(
  select 1 from public.profiles p join public.roles r on r.id=p.role_id join public.user_business_units u on u.user_id=p.id
  where p.id=target_driver and u.business_unit_id=target_unit and p.active and p.deleted_at is null and r.key='driver')
$$;
create or replace function public.dist_drivers(target_unit uuid) returns table(id uuid,first_name text,last_name text) language sql stable security definer set search_path='' as $$
 select p.id,p.first_name,p.last_name from public.profiles p join public.roles r on r.id=p.role_id join public.user_business_units u on u.user_id=p.id
 where u.business_unit_id=target_unit and p.active and p.deleted_at is null and r.key='driver'
 and public.can_access_unit(u.company_id,u.business_unit_id) and public.has_permission('finance.distribution.routes.manage') order by p.first_name,p.last_name
$$;

create or replace function public.dist_create_order(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); unit record; customer public.dist_customers%rowtype; line jsonb; priced record; oid uuid:=gen_random_uuid(); seq bigint; yr smallint; subtotal_value numeric:=0; discount_value numeric:=coalesce((payload->>'discount')::numeric,0); method text:=payload->>'payment_method'; condition_value text:=payload->>'payment_condition'; delivery date:=(payload->>'delivery_date')::date; route boolean:=coalesce((payload->>'route_sale')::boolean,false);
begin
 if not public.has_permission('finance.distribution.orders.create') and not public.has_permission('finance.distribution.driver') then raise exception 'Sin autorizacion'; end if;
 select bu.id,bu.company_id into strict unit from public.business_units bu where bu.id=(payload->>'business_unit_id')::uuid and bu.code='DA' and bu.active and bu.deleted_at is null;
 if not public.can_access_unit(unit.company_id,unit.id) or public.dist_closed(unit.id,delivery) then raise exception 'Unidad no autorizada o fecha cerrada'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb))=0 then raise exception 'El pedido requiere productos'; end if;
 if nullif(payload->>'customer_id','') is not null then
  select * into strict customer from public.dist_customers where id=(payload->>'customer_id')::uuid and business_unit_id=unit.id and status='active' and deleted_at is null;
 else
  if not route or nullif(trim(payload->>'occasional_customer_name'),'') is null then raise exception 'Los pedidos planificados requieren cliente registrado'; end if;
  if condition_value='credit' or method='credit' then raise exception 'Un cliente ocasional no puede comprar a credito'; end if;
 end if;
 if condition_value='credit' and (not customer.has_credit or customer.credit_status<>'current' or customer.commercial_block) then raise exception 'Credito no autorizado'; end if;
 yr:=extract(year from delivery)::smallint;
 seq:=public.dist_next_order_sequence(unit.id,yr);
 for line in select * from jsonb_array_elements(payload->'lines') loop
  if (line->>'quantity')::numeric<=0 then raise exception 'Cantidad invalida'; end if;
  if not exists(select 1 from public.dist_products where id=(line->>'product_id')::uuid and business_unit_id=unit.id and active and deleted_at is null) then raise exception 'Producto no autorizado'; end if;
  select * into priced from public.dist_resolve_price((line->>'product_id')::uuid,customer.id,delivery);
  if priced.price_id is null then raise exception 'Producto sin precio vigente'; end if;
  subtotal_value:=subtotal_value+round(priced.amount*(line->>'quantity')::numeric,2);
 end loop;
 if discount_value>subtotal_value then raise exception 'Descuento invalido'; end if;
 if condition_value='credit' and public.dist_outstanding(customer.id,null)+subtotal_value-discount_value>customer.credit_limit and not public.has_permission('finance.distribution.orders.manage') then raise exception 'Limite de credito excedido'; end if;
 insert into public.dist_orders(id,company_id,business_unit_id,order_number,delivery_date,estimated_time,customer_id,occasional_customer_name,delivery_address,customer_phone,route_sale,request_regular_customer,payment_method,payment_condition,status,payment_status,priority,subtotal,discount,total,notes,created_by)
 values(oid,unit.company_id,unit.id,format('DA-%s-%s',yr,lpad(seq::text,6,'0')),delivery,nullif(payload->>'estimated_time','')::time,customer.id,nullif(trim(payload->>'occasional_customer_name'),''),coalesce(nullif(trim(payload->>'delivery_address'),''),customer.address),coalesce(nullif(trim(payload->>'customer_phone'),''),customer.phone),route,coalesce((payload->>'request_regular_customer')::boolean,false),method,condition_value,'scheduled',case when condition_value='credit' then 'credit' else 'pending' end,coalesce(payload->>'priority','normal'),subtotal_value,discount_value,subtotal_value-discount_value,nullif(trim(payload->>'notes'),''),me);
 for line in select * from jsonb_array_elements(payload->'lines') loop
  select * into priced from public.dist_resolve_price((line->>'product_id')::uuid,customer.id,delivery);
  insert into public.dist_order_lines(company_id,business_unit_id,order_id,product_id,planned_quantity,unit_price,price_origin,price_id,line_total,created_by)
  values(unit.company_id,unit.id,oid,(line->>'product_id')::uuid,(line->>'quantity')::numeric,priced.amount,priced.origin,priced.price_id,round(priced.amount*(line->>'quantity')::numeric,2),me);
 end loop;
 insert into public.dist_order_status_history(company_id,business_unit_id,order_id,new_status,reason,changed_by) values(unit.company_id,unit.id,oid,'scheduled','Creacion',me);
 return oid;
end $$;

create or replace function public.dist_assign_order(target_order uuid,target_driver uuid) returns void language plpgsql security invoker set search_path='' as $$
declare o record; next_pos integer;
begin
 if not public.has_permission('finance.distribution.routes.manage') then raise exception 'Sin autorizacion'; end if;
 select * into strict o from public.dist_orders where id=target_order for update;
 if public.dist_closed(o.business_unit_id,o.delivery_date) or o.status in('delivered','partially_delivered','cancelled','voided') then raise exception 'Pedido no asignable'; end if;
 if not public.dist_is_valid_driver(o.business_unit_id,target_driver) then raise exception 'Chofer no valido'; end if;
 select coalesce(max(route_position),0)+1 into next_pos from public.dist_orders where business_unit_id=o.business_unit_id and delivery_date=o.delivery_date and driver_id=target_driver and status not in('cancelled','voided');
 update public.dist_orders set driver_id=target_driver,route_position=next_pos,status=case when status='scheduled' then 'assigned' else status end,updated_by=auth.uid() where id=target_order;
end $$;
create or replace function public.dist_reorder_route(target_unit uuid,target_date date,target_driver uuid,ordered_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare item uuid; n integer:=0;
begin
 if not public.has_permission('finance.distribution.routes.manage') or public.dist_closed(target_unit,target_date) then raise exception 'Sin autorizacion o fecha cerrada'; end if;
 if (select count(*) from public.dist_orders where id=any(ordered_ids) and business_unit_id=target_unit and delivery_date=target_date and driver_id=target_driver)<>cardinality(ordered_ids) then raise exception 'Ruta inconsistente'; end if;
 update public.dist_orders set route_position=route_position+10000 where id=any(ordered_ids);
 foreach item in array ordered_ids loop n:=n+1; update public.dist_orders set route_position=n,updated_by=auth.uid() where id=item; end loop;
end $$;
create or replace function public.dist_change_order_status(target_order uuid,target_status text,details jsonb default '{}'::jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare o record; allowed boolean:=false;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 if public.dist_closed(o.business_unit_id,o.delivery_date) then raise exception 'Fecha cerrada'; end if;
 if public.has_permission('finance.distribution.driver') and o.driver_id<>auth.uid() then raise exception 'Pedido de otro chofer'; end if;
 if not public.has_permission('finance.distribution.driver') and not public.has_permission('finance.distribution.orders.manage') then raise exception 'Sin autorizacion'; end if;
 allowed:= (o.status='scheduled' and target_status in('assigned','cancelled','voided')) or (o.status='assigned' and target_status in('en_route','scheduled','cancelled','voided')) or (o.status='en_route' and target_status in('delivered','partially_delivered','not_delivered')) or (o.status='not_delivered' and target_status='rescheduled');
 if not allowed then raise exception 'Transicion no permitida: % -> %',o.status,target_status; end if;
 if target_status='not_delivered' and nullif(trim(details->>'reason'),'') is null then raise exception 'Motivo obligatorio'; end if;
 update public.dist_orders set status=target_status,actual_delivered_at=case when target_status in('delivered','partially_delivered') then now() else actual_delivered_at end,non_delivery_reason=case when target_status='not_delivered' then details->>'reason' else non_delivery_reason end,non_delivery_notes=case when target_status='not_delivered' then details->>'notes' else non_delivery_notes end,updated_by=auth.uid() where id=target_order;
 insert into public.dist_order_status_history(company_id,business_unit_id,order_id,previous_status,new_status,reason,metadata,changed_by) values(o.company_id,o.business_unit_id,o.id,o.status,target_status,details->>'reason',details,auth.uid());
 if target_status in('delivered','partially_delivered') then
  insert into public.dist_deliveries(company_id,business_unit_id,order_id,driver_id,notes,latitude,longitude,evidence_path,created_by) values(o.company_id,o.business_unit_id,o.id,o.driver_id,details->>'notes',nullif(details->>'latitude','')::numeric,nullif(details->>'longitude','')::numeric,nullif(details->>'evidence_path',''),auth.uid()) on conflict(order_id) do nothing;
 end if;
end $$;
create or replace function public.dist_request_order_change(target_order uuid,request_type text,reason_text text,proposed jsonb default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.dist_orders; rid uuid;
begin
 if not public.has_permission('finance.distribution.requests.create') then raise exception 'Sin autorizacion'; end if;
 if request_type not in('edit','void') or length(trim(reason_text))<3 then raise exception 'Solicitud invalida'; end if;
 select * into strict o from public.dist_orders where id=target_order;
 insert into public.dist_change_requests(company_id,business_unit_id,order_id,type,reason,current_data,proposed_data,requested_by) values(o.company_id,o.business_unit_id,o.id,request_type,reason_text,to_jsonb(o),proposed,auth.uid()) returning id into rid;
 return rid;
end $$;
create or replace function public.dist_review_order_change(target_request uuid,decision text,comment_text text) returns void language plpgsql security invoker set search_path='' as $$
declare r public.dist_change_requests;o public.dist_orders;
begin
 if not public.has_permission('finance.distribution.requests.review') or decision not in('approved','rejected') then raise exception 'Sin autorizacion'; end if;
 select * into strict r from public.dist_change_requests where id=target_request for update;
 if r.status not in('pending','in_review') then raise exception 'Solicitud ya resuelta'; end if;
 select * into strict o from public.dist_orders where id=r.order_id for update;
 if decision='approved' then
  if r.type='void' then update public.dist_orders set status='voided',payment_status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=r.reason,updated_by=auth.uid() where id=o.id;
  else update public.dist_orders set delivery_date=coalesce((r.proposed_data->>'delivery_date')::date,delivery_date),estimated_time=coalesce((r.proposed_data->>'estimated_time')::time,estimated_time),delivery_address=coalesce(nullif(r.proposed_data->>'delivery_address',''),delivery_address),notes=coalesce(r.proposed_data->>'notes',notes),updated_by=auth.uid() where id=o.id; end if;
 end if;
 update public.dist_change_requests set status=decision,reviewed_by=auth.uid(),resolution_comment=comment_text,reviewed_at=now(),applied_data=case when decision='approved' then (select to_jsonb(x) from public.dist_orders x where x.id=o.id) end where id=r.id;
end $$;
create or replace function public.dist_register_payment(target_order uuid,payment_amount numeric,payment_method text,receipt text,notes_text text,idempotency text) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.dist_orders;paid numeric;pid uuid;
begin
 if not (public.has_permission('finance.distribution.payments.manage') or public.has_permission('finance.distribution.driver')) or payment_amount<=0 then raise exception 'Pago no autorizado'; end if;
 select * into strict o from public.dist_orders where id=target_order for update;
 if public.has_permission('finance.distribution.driver') and o.driver_id<>auth.uid() then raise exception 'Pedido de otro chofer'; end if;
 select coalesce(sum(a.amount),0) into paid from public.dist_payment_allocations a join public.dist_payments p on p.id=a.payment_id and p.status='confirmed' where a.order_id=o.id;
 if paid+payment_amount>o.total then raise exception 'El pago supera la deuda'; end if;
 insert into public.dist_payments(company_id,business_unit_id,customer_id,amount,method,receipt_number,notes,idempotency_key,registered_by) values(o.company_id,o.business_unit_id,o.customer_id,payment_amount,payment_method,nullif(receipt,''),nullif(notes_text,''),idempotency,auth.uid()) returning id into pid;
 insert into public.dist_payment_allocations(payment_id,order_id,amount) values(pid,o.id,payment_amount);
 update public.dist_orders set payment_status=case when paid+payment_amount=o.total then 'paid' else 'partial' end,updated_by=auth.uid() where id=o.id;
 return pid;
end $$;

create or replace function public.dist_daily_summary(target_unit uuid,target_date date) returns jsonb language sql stable security invoker set search_path='' as $$
 with orders as(select * from public.dist_orders where business_unit_id=target_unit and delivery_date=target_date and deleted_at is null and status not in('cancelled','voided')),
 payments as(select coalesce(sum(a.amount),0) total from public.dist_payment_allocations a join public.dist_payments p on p.id=a.payment_id and p.status='confirmed' join orders o on o.id=a.order_id),
 products as(select coalesce(sum(coalesce(l.delivered_quantity,l.planned_quantity)*p.ice_weight_kg),0) ice_kg,coalesce(sum(coalesce(l.delivered_quantity,l.planned_quantity)) filter(where p.ice_weight_kg=0),0) water_units from public.dist_order_lines l join orders o on o.id=l.order_id join public.dist_products p on p.id=l.product_id where o.status in('delivered','partially_delivered'))
 select jsonb_build_object('orders_total',count(*),'delivered',count(*) filter(where status='delivered'),'partial',count(*) filter(where status='partially_delivered'),'pending',count(*) filter(where status in('scheduled','assigned','en_route')),'not_delivered',count(*) filter(where status='not_delivered'),'unassigned',count(*) filter(where driver_id is null),'planned_sales',coalesce(sum(total),0),'delivered_sales',coalesce(sum(total) filter(where status in('delivered','partially_delivered')),0),'cash',coalesce(sum(total) filter(where payment_method='cash'),0),'transfer',coalesce(sum(total) filter(where payment_method='transfer'),0),'credit',coalesce(sum(total) filter(where payment_condition='credit'),0),'collected',(select total from payments),'ice_kg',(select ice_kg from products),'water_units',(select water_units from products)) from orders
$$;

-- Auditoria general append-only.
create trigger audit_dist_customers after insert or update or delete on public.dist_customers for each row execute function public.audit_row_change();
create trigger audit_dist_products after insert or update or delete on public.dist_products for each row execute function public.audit_row_change();
create trigger audit_dist_prices after insert or update or delete on public.dist_prices for each row execute function public.audit_row_change();
create trigger audit_dist_orders after insert or update or delete on public.dist_orders for each row execute function public.audit_row_change();
create trigger audit_dist_change_requests after insert or update on public.dist_change_requests for each row execute function public.audit_row_change();
create trigger audit_dist_payments after insert or update on public.dist_payments for each row execute function public.audit_row_change();
create trigger audit_dist_closures after insert or update on public.dist_daily_closures for each row execute function public.audit_row_change();

alter table public.dist_customer_classifications enable row level security;alter table public.dist_customers enable row level security;alter table public.dist_product_categories enable row level security;alter table public.dist_products enable row level security;alter table public.dist_prices enable row level security;alter table public.dist_orders enable row level security;alter table public.dist_order_lines enable row level security;alter table public.dist_order_status_history enable row level security;alter table public.dist_change_requests enable row level security;alter table public.dist_deliveries enable row level security;alter table public.dist_payments enable row level security;alter table public.dist_payment_allocations enable row level security;alter table public.dist_daily_closures enable row level security;alter table public.dist_customer_sequences enable row level security;alter table public.dist_order_sequences enable row level security;

create policy dist_catalog_read on public.dist_customer_classifications for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.view'));
create policy dist_catalog_insert on public.dist_customer_classifications for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_catalog_update on public.dist_customer_classifications for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_categories_read on public.dist_product_categories for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.view'));
create policy dist_categories_insert on public.dist_product_categories for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_categories_update on public.dist_product_categories for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_products_read on public.dist_products for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.view'));
create policy dist_products_insert on public.dist_products for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_products_update on public.dist_products for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_prices_read on public.dist_prices for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.view'));
create policy dist_prices_insert on public.dist_prices for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_prices_update on public.dist_prices for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.catalogs.manage'));
create policy dist_customers_read on public.dist_customers for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.view'));
create policy dist_customers_insert on public.dist_customers for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.customers.manage'));
create policy dist_customers_update on public.dist_customers for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.customers.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.customers.manage'));
create policy dist_orders_read on public.dist_orders for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.reports.view') or public.has_permission('finance.distribution.orders.create') or (public.has_permission('finance.distribution.driver') and driver_id=(select auth.uid()))));
create policy dist_orders_insert on public.dist_orders for insert to authenticated with check(created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.orders.create') or (route_sale and public.has_permission('finance.distribution.driver'))));
create policy dist_orders_manage on public.dist_orders for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.orders.manage') or public.has_permission('finance.distribution.routes.manage') or (driver_id=(select auth.uid()) and public.has_permission('finance.distribution.driver')))) with check(public.can_access_unit(company_id,business_unit_id));
create policy dist_lines_read on public.dist_order_lines for select to authenticated using(exists(select 1 from public.dist_orders o where o.id=order_id));
create policy dist_lines_insert on public.dist_order_lines for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.orders.create') or public.has_permission('finance.distribution.driver')));
create policy dist_history_read on public.dist_order_status_history for select to authenticated using(exists(select 1 from public.dist_orders o where o.id=order_id));
create policy dist_history_insert on public.dist_order_status_history for insert to authenticated with check(changed_by=(select auth.uid()) and exists(select 1 from public.dist_orders o where o.id=order_id));
create policy dist_requests_read on public.dist_change_requests for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (requested_by=(select auth.uid()) or public.has_permission('finance.distribution.requests.review')));
create policy dist_requests_insert on public.dist_change_requests for insert to authenticated with check(requested_by=(select auth.uid()) and public.has_permission('finance.distribution.requests.create'));
create policy dist_requests_review on public.dist_change_requests for update to authenticated using(public.has_permission('finance.distribution.requests.review') and public.can_access_unit(company_id,business_unit_id)) with check(public.has_permission('finance.distribution.requests.review'));
create policy dist_deliveries_read on public.dist_deliveries for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.reports.view') or driver_id=(select auth.uid())));
create policy dist_deliveries_insert on public.dist_deliveries for insert to authenticated with check(created_by=(select auth.uid()) and ((driver_id=(select auth.uid()) and public.has_permission('finance.distribution.driver')) or public.has_permission('finance.distribution.orders.manage')));
create policy dist_payments_read on public.dist_payments for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.payments.manage') or public.has_permission('finance.distribution.reports.view') or registered_by=(select auth.uid())));
create policy dist_payments_insert on public.dist_payments for insert to authenticated with check(registered_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and (public.has_permission('finance.distribution.payments.manage') or public.has_permission('finance.distribution.driver')));
create policy dist_allocations_read on public.dist_payment_allocations for select to authenticated using(exists(select 1 from public.dist_payments p where p.id=payment_id));
create policy dist_allocations_insert on public.dist_payment_allocations for insert to authenticated with check(exists(select 1 from public.dist_payments p where p.id=payment_id and p.registered_by=(select auth.uid())));
create policy dist_closures_read on public.dist_daily_closures for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.reports.view'));
create policy dist_closures_insert on public.dist_daily_closures for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.closures.manage'));
create policy dist_closures_update on public.dist_daily_closures for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.closures.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.distribution.closures.manage'));

-- Secuencias sin acceso directo. Las funciones privilegiadas administran clientes; los pedidos usan RLS y secuencia atomica.
revoke all on public.dist_customer_sequences,public.dist_order_sequences from authenticated;
grant select,insert,update on public.dist_customer_classifications,public.dist_customers,public.dist_product_categories,public.dist_products,public.dist_prices,public.dist_orders,public.dist_order_lines,public.dist_order_status_history,public.dist_change_requests,public.dist_deliveries,public.dist_payments,public.dist_payment_allocations,public.dist_daily_closures to authenticated,service_role;
grant select,insert,update on public.dist_customer_sequences,public.dist_order_sequences to service_role;
grant execute on function public.dist_closed(uuid,date),public.dist_outstanding(uuid,uuid),public.dist_resolve_price(uuid,uuid,date),public.dist_create_order(jsonb),public.dist_assign_order(uuid,uuid),public.dist_reorder_route(uuid,date,uuid,uuid[]),public.dist_change_order_status(uuid,text,jsonb),public.dist_request_order_change(uuid,text,text,jsonb),public.dist_review_order_change(uuid,text,text),public.dist_register_payment(uuid,numeric,text,text,text,text),public.dist_daily_summary(uuid,date) to authenticated;
revoke execute on function public.dist_prepare_customer() from public,anon,authenticated;
revoke execute on function public.dist_guard_order_update() from public,anon,authenticated;
revoke execute on function public.dist_next_order_sequence(uuid,smallint) from public,anon;
grant execute on function public.dist_next_order_sequence(uuid,smallint) to authenticated;
revoke execute on function public.dist_is_valid_driver(uuid,uuid),public.dist_drivers(uuid) from public,anon;
grant execute on function public.dist_is_valid_driver(uuid,uuid),public.dist_drivers(uuid) to authenticated;

-- Catalogos iniciales solo para la unidad existente DA, sin clientes ficticios.
insert into public.dist_customer_classifications(company_id,business_unit_id,code,name,display_order)
select bu.company_id,bu.id,lower(regexp_replace(x.name,'[^a-zA-Z0-9]+','_','g')),x.name,x.ord from public.business_units bu cross join unnest(array['Minimarket','Supermercado','Restaurante','Botillería','Bar','Pub','Discoteca','Hotel','Hostal','Cafetería','Empresa','Institución','Distribuidor','Particular','Otro']) with ordinality x(name,ord) where bu.code='DA'
on conflict(business_unit_id,code) do update set name=excluded.name,active=true,deleted_at=null;
insert into public.dist_product_categories(company_id,business_unit_id,code,name,display_order)
select bu.company_id,bu.id,x.code,x.name,x.ord from public.business_units bu cross join (values('ICE','Hielo',1),('WATER','Agua',2)) x(code,name,ord) where bu.code='DA' on conflict(business_unit_id,code) do update set name=excluded.name,active=true,deleted_at=null;
insert into public.dist_products(company_id,business_unit_id,category_id,code,name,presentation,unit,ice_weight_kg,display_order)
select bu.company_id,bu.id,c.id,x.code,x.name,x.presentation,'unit',x.weight,x.ord from public.business_units bu join public.dist_product_categories c on c.business_unit_id=bu.id cross join (values
 ('ICE-1KG','Hielo cubo 1 kg','Bolsa 1 kg','ICE',1::numeric,1),('ICE-2KG','Hielo cubo 2 kg','Bolsa 2 kg','ICE',2,2),('FRAPPE-1KG','Hielo frappé 1 kg','Bolsa 1 kg','ICE',1,3),('FRAPPE-2KG','Hielo frappé 2 kg','Bolsa 2 kg','ICE',2,4),
 ('WATER-20L','Agua 20 litros','Bidón 20 L','WATER',0,5),('WATER-6L','Agua 6 litros','Botella 6 L','WATER',0,6),('WATER-16L','Agua 1,6 litros','Botella 1,6 L','WATER',0,7),('WATER-500','Agua 500 cc','Botella 500 cc','WATER',0,8)) x(code,name,presentation,category,weight,ord)
where bu.code='DA' and c.code=x.category on conflict(business_unit_id,code) do update set name=excluded.name,presentation=excluded.presentation,ice_weight_kg=excluded.ice_weight_kg,active=true,deleted_at=null;

commit;
