begin;

-- El producto se cargó por error como "Agua 500 cc"; el envase real es de 600 cc
-- y coincide con la materia prima DA-MP-WATER-600CC.
update public.dist_products p
set code='WATER-600',name='Agua 600 cc',presentation='Botella 600 cc'
from public.business_units bu
where p.business_unit_id=bu.id and bu.code='DA' and p.code='WATER-500';

commit;
