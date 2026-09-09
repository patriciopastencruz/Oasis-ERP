begin;

-- Los sufijos (A)/(B) de la web venían de su propio catálogo interno;
-- para el ERP se reemplazan por el criterio real de diferenciación:
-- (A) = fabricado en taller propio, (B) = módulo importado.

update public.om_products set name='Oficina Modular Importado'
  where business_unit_id=(select id from public.business_units where code='OM') and name='Oficina Modular (B)';
update public.om_products set name='Modular con baño Importado'
  where business_unit_id=(select id from public.business_units where code='OM') and name='Modular con baño (B)';
update public.om_products set name='Oficina Modular 4x3 Importado'
  where business_unit_id=(select id from public.business_units where code='OM') and name='Oficina Modular 4x3 (B)';
update public.om_products set name='Casa Modular 36 m² Importado'
  where business_unit_id=(select id from public.business_units where code='OM') and name='Casa Modular 36 m² (B)';
update public.om_products set name='Casa Modular 36 m² Fabricado'
  where business_unit_id=(select id from public.business_units where code='OM') and name='Casa Modular 36 m² (A)';

commit;
