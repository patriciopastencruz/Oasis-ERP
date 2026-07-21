begin;

-- dist_resolve_price siempre priorizaba el precio por cliente sobre el
-- precio general, sin importar cuál fuera más reciente. La carga inicial
-- de clientes (20260715041607) le asignó a cada cliente un precio propio
-- por producto, sin fecha de término: como ese precio por cliente nunca
-- vence, cualquier cambio posterior al precio general de un producto
-- quedaba sin efecto para esos clientes, porque el precio por cliente
-- (aunque más antiguo) seguía ganando siempre.
-- Se cambia el criterio: gana el precio vigente más reciente (por
-- valid_from y luego created_at como desempate), sea general o por
-- cliente. Así, si se corrige el precio general, se aplica a los
-- clientes que no tengan un precio propio más nuevo; y un precio por
-- cliente asignado después de esa corrección sigue teniendo prioridad,
-- porque es el más reciente.
create or replace function public.dist_resolve_price(target_product uuid,target_customer uuid,target_date date)
returns table(price_id uuid,amount numeric,origin text) language sql stable security invoker set search_path='' as $$
 select p.id,p.amount,case when p.customer_id is null then 'standard' else 'customer' end
 from public.dist_prices p where p.product_id=target_product and p.active and p.deleted_at is null and p.valid_from<=target_date
 and (p.valid_until is null or p.valid_until>=target_date) and (p.customer_id=target_customer or p.customer_id is null)
 order by p.valid_from desc,p.created_at desc limit 1
$$;

commit;
