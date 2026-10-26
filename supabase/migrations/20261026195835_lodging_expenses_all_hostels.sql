begin;

-- Gastos del hostal en los tres hostales: Hostal Uruguay ya lo tenía; se agregan Oasis Centro (HOC) y Oasis Cobija (HOB)
-- con los mismos tipos de gasto, permisos y comprobante obligatorio. Los tipos de cada hostal siguen siendo suyos.

create or replace function public.lodging_expenses_assert_unit(target_unit uuid) returns public.business_units language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 return unit;
end $$;
revoke execute on function public.lodging_expenses_assert_unit(uuid) from public,anon,authenticated;

-- Mismos tipos de gasto que Hostal Uruguay.
insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,allow_expenses,sort_order)
select u.company_id,u.id,v.section,v.name,false,true,v.sort_order
from public.business_units u
cross join (values
 ('variable','Aseo y limpieza',31),
 ('variable','Insumos de cocina',32),
 ('variable','Insumos de baño y amenities',33),
 ('variable','Lavandería',34),
 ('fixed','Luz',11),
 ('fixed','Agua',12),
 ('fixed','Internet y telefonía',13)
) as v(section,name,sort_order)
where u.code in('HOC','HOB') and u.deleted_at is null
on conflict(business_unit_id,name) do update set allow_expenses=true,active=true;

update public.lodging_finance_categories c set allow_expenses=true
from public.business_units u
where u.id=c.business_unit_id and u.code in('HOC','HOB')
 and c.name in('Gas y combustible','Reparaciones y mantenimiento','Marketing y publicidad','Almuerzos y alimentación','Otros gastos variables');

commit;
