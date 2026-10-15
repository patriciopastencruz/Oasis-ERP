begin;

-- Metas de venta promedio por habitación: Centro 29.000, Cobija 32.000 y Uruguay 27.000.
-- (Las metas de RevPAR que se derivan de venta promedio × ocupación meta se ajustan con ellas.)
update public.lodging_report_goals g set average_rate=v.rate,updated_at=now()
from public.business_units u join (values ('HOC',29000),('HOB',32000),('HU',27000)) as v(code,rate) on v.code=u.code
where g.business_unit_id=u.id;

commit;
