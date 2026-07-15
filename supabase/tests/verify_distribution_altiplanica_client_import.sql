\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset

do $$
declare
  customer_count integer;
  price_count integer;
  sample_customer_id uuid;
  sample_price_count integer;
begin
  select count(*) into customer_count from public.dist_customers
  where business_unit_id = (select id from public.business_units where code='DA') and deleted_at is null;
  if customer_count <> 360 then
    raise exception 'Se esperaban 360 clientes cargados, hay %', customer_count;
  end if;

  select count(*) into price_count from public.dist_prices
  where business_unit_id = (select id from public.business_units where code='DA')
    and change_reason = 'Carga inicial migración clientes Distribuidora Altiplánica';
  if price_count <> 2874 then
    raise exception 'Se esperaban 2874 precios cargados, hay %', price_count;
  end if;

  -- Cliente conocido de la fuente, con clasificación y crédito bien resueltos.
  select id into sample_customer_id from public.dist_customers where name = 'BIRD GREEN';
  if sample_customer_id is null then raise exception 'No se encontró el cliente BIRD GREEN'; end if;
  if not exists (
    select 1 from public.dist_customers c join public.dist_customer_classifications cl on cl.id = c.classification_id
    where c.id = sample_customer_id and cl.name = 'Bar' and c.has_credit and c.credit_limit = 500000 and c.credit_days = 30
  ) then
    raise exception 'BIRD GREEN no quedó con clasificación Bar / crédito 500.000 a 30 días';
  end if;

  select count(*) into sample_price_count from public.dist_prices where customer_id = sample_customer_id;
  if sample_price_count <> 8 then
    raise exception 'BIRD GREEN debería tener 8 precios, tiene %', sample_price_count;
  end if;

  -- Duplicados: debe quedar solo el registro de mayor precio.
  if (select count(*) from public.dist_customers where name = 'ALMACEN' and business_unit_id = (select id from public.business_units where code='DA')) <> 1 then
    raise exception 'ALMACEN debería quedar como un único cliente';
  end if;
  if not exists (
    select 1 from public.dist_customers c join public.dist_prices p on p.customer_id = c.id
    join public.dist_products pr on pr.id = p.product_id
    where c.name = 'ALMACEN' and pr.code = 'ICE-1KG' and p.amount = 536
  ) then
    raise exception 'ALMACEN debería haber quedado con el precio más alto (536), se perdió la resolución de duplicados';
  end if;

  -- Clasificación heurística por nombre para cocinerías sin clasificación en la fuente.
  if not exists (
    select 1 from public.dist_customers c join public.dist_customer_classifications cl on cl.id = c.classification_id
    where c.name = 'COCINERIA PIZCONE' and cl.name = 'Restaurante'
  ) then
    raise exception 'COCINERIA PIZCONE debería clasificarse como Restaurante';
  end if;

  raise notice 'Carga de clientes Distribuidora Altiplánica verificada: % clientes, % precios', customer_count, price_count;
end $$;

rollback;
