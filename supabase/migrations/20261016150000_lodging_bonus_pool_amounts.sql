begin;

-- Montos del bono mensual por hostal: Centro 150.000, Cobija 150.000 y Uruguay 100.000.
update public.lodging_bonus_config c set pool_amount=v.amount,updated_at=now()
from public.business_units u join (values ('HOC',150000),('HOB',150000),('HU',100000)) as v(code,amount) on v.code=u.code
where c.business_unit_id=u.id;

commit;
