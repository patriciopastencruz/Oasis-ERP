begin;

-- Metas de venta promedio por habitación: Centro 28.000 y Cobija 31.000 (Uruguay se mantiene en 27.000).
update public.lodging_report_goals g set average_rate=v.rate,updated_at=now()
from public.business_units u join (values ('HOC',28000),('HOB',31000)) as v(code,rate) on v.code=u.code
where g.business_unit_id=u.id;

commit;
