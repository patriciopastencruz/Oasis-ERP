begin;

-- Catálogo de productos/servicios estándar de Oasis Modulares, para que el
-- vendedor arme la cotización eligiendo en vez de escribir descripción y
-- precio a mano cada vez. created_by/updated_by quedan nulos para filas
-- sembradas por migración (sin usuario real detrás), y se completan cuando
-- se crean o editan desde la UI.

create table public.om_products(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 name text not null,description text,
 unit_price numeric(14,2) not null check(unit_price>=0),
 active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,name)
);
create index om_products_unit_idx on public.om_products(business_unit_id) where deleted_at is null and active;

create or replace function public.om_create_product(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); unit record; pid uuid:=gen_random_uuid();
begin
 if not public.has_permission('sales.quotations.approve') then raise exception 'Sin autorizacion'; end if;
 select bu.id,bu.company_id into strict unit from public.business_units bu where bu.code='OM' and bu.active and bu.deleted_at is null;
 if not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'El producto requiere un nombre'; end if;
 if (payload->>'unit_price')::numeric<0 then raise exception 'Precio invalido'; end if;
 insert into public.om_products(id,company_id,business_unit_id,name,description,unit_price,created_by)
 values(pid,unit.company_id,unit.id,trim(payload->>'name'),nullif(trim(payload->>'description'),''),(payload->>'unit_price')::numeric,me);
 return pid;
end $$;

create or replace function public.om_update_product(target_product uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_products;
begin
 if not public.has_permission('sales.quotations.approve') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_products where id=target_product and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'El producto requiere un nombre'; end if;
 if (payload->>'unit_price')::numeric<0 then raise exception 'Precio invalido'; end if;
 update public.om_products set name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),unit_price=(payload->>'unit_price')::numeric,updated_by=me,updated_at=now() where id=p.id;
end $$;

create or replace function public.om_toggle_product(target_product uuid,is_active boolean) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_products;
begin
 if not public.has_permission('sales.quotations.approve') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_products where id=target_product and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 update public.om_products set active=is_active,updated_by=me,updated_at=now() where id=p.id;
end $$;

alter table public.om_products enable row level security;
create policy om_products_read on public.om_products for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (public.has_permission('sales.quotations.create') or public.has_permission('sales.quotations.approve')));

revoke all on public.om_products from authenticated;
grant select on public.om_products to authenticated;
grant execute on function public.om_create_product(jsonb),public.om_update_product(uuid,jsonb),public.om_toggle_product(uuid,boolean) to authenticated;

insert into public.om_products(company_id,business_unit_id,name,description,unit_price)
select bu.company_id,bu.id,v.name,v.description,v.unit_price
from public.business_units bu
cross join (values
 ('Modular fabricado 6,0 x 3,0 mts','Incluye tablero eléctrico, instalación eléctrica, 2 enchufes, 2 luces, aislación de techo y paredes 50mm, 2 ventanas de aluminio',3690000::numeric),
 ('División vulcanita','Considera 3 metros de ancho',150000::numeric),
 ('Puerta interior',null,50000::numeric),
 ('Bodega 6,0 x 2,5 mts','Revestimiento metal 4mm',1900000::numeric)
) as v(name,description,unit_price)
where bu.code='OM' and bu.active and bu.deleted_at is null
on conflict(business_unit_id,name) do nothing;

commit;
