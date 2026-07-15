begin;

-- dist_resolve_price ordenaba solo por valid_from desc para elegir el
-- precio vigente. Cuando existen varias filas de precio (mismo cliente y
-- producto) con la misma fecha de vigencia -típico al corregir un precio el
-- mismo día en que ya existía otro, por ejemplo tras la carga inicial de
-- clientes- el empate no tenía criterio de desempate y Postgres podía
-- devolver cualquiera de las filas empatadas de forma no determinística: a
-- veces el precio corregido, a veces uno anterior. Se agrega created_at
-- desc como desempate: entre precios igualmente vigentes, gana el más
-- recientemente creado.
create or replace function public.dist_resolve_price(target_product uuid,target_customer uuid,target_date date)
returns table(price_id uuid,amount numeric,origin text) language sql stable security invoker set search_path='' as $$
 select p.id,p.amount,case when p.customer_id is null then 'standard' else 'customer' end
 from public.dist_prices p where p.product_id=target_product and p.active and p.deleted_at is null and p.valid_from<=target_date
 and (p.valid_until is null or p.valid_until>=target_date) and (p.customer_id=target_customer or p.customer_id is null)
 order by (p.customer_id is not null) desc,p.valid_from desc,p.created_at desc limit 1
$$;

commit;
