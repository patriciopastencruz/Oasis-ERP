begin;

-- Cierre mensual y Gastos de Hostal Uruguay: faltaban el arriendo y un tipo para el resto de los gastos fijos.
insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,allow_expenses,sort_order)
select u.company_id,u.id,'fixed',v.name,false,true,v.sort_order
from public.business_units u
cross join (values
 ('Arriendo',14),
 ('Otros gastos fijos',90)
) as v(name,sort_order)
where u.code='HU' and u.deleted_at is null
on conflict(business_unit_id,name) do update set section='fixed',allow_expenses=true,active=true;

commit;
