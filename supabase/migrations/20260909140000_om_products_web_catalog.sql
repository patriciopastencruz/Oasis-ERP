begin;

-- Agrega al catálogo los modelos publicados en oasismodulareschile.cl que
-- todavía no existían (Oficina Modular (A)/Bodega Modular ya estaban
-- sembrados con otro nombre y el mismo precio/medida). Precios "+ IVA"
-- tal como se publican en la web, consistentes con como om_quotations
-- calcula el IVA por separado sobre el neto.
-- on conflict actualiza precio/descripción si se vuelve a correr esta
-- migración con precios nuevos de la web.

insert into public.om_products(company_id,business_unit_id,name,description,unit_price)
select bu.company_id,bu.id,v.name,v.description,v.unit_price
from public.business_units bu
cross join (values
 ('Oficina Modular (B)','3,0 x 6,0 x 2,8 mts',3600000::numeric),
 ('Modular con baño (B)','3,0 x 6,0 x 2,8 mts',4980000::numeric),
 ('Oficina Modular 4x3 (B)','3,0 x 4,0 mts',2990000::numeric),
 ('Habitación modular con baño','3,0 x 4,0 mts',4490000::numeric),
 ('Casa Modular 36 m² (B)','6,0 x 6,0 x 2,8 mts',8690000::numeric),
 ('Caseta de seguridad','2,0 x 2,0 x 2,5 mts',990000::numeric),
 ('Casa Modular 36 m² (A)','3,0 x 6,0 x 2,5 mts',8890000::numeric),
 ('Camarín modular con duchas','3,0 x 6,0 x 2,6 mts',5990000::numeric)
) as v(name,description,unit_price)
where bu.code='OM' and bu.active and bu.deleted_at is null
on conflict(business_unit_id,name) do update set description=excluded.description,unit_price=excluded.unit_price;

commit;
