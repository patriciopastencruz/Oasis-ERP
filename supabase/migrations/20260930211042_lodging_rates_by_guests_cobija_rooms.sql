begin;

-- Tarifas por cantidad de personas por habitación ({"1":27000,"2":32000,...}).
-- Al crear una reserva se sugiere la tarifa según las personas; si no hay
-- tarifa para esa cantidad se usa la del máximo definido y, sin tarifas,
-- la tarifa base. La tarifa base queda como el precio para 1 persona.
alter table public.lodging_rooms add column rates_by_guests jsonb
 check (rates_by_guests is null or jsonb_typeof(rates_by_guests)='object');

-- Habitaciones de Hostal Cobija (planilla "HABITACIONES COBIJA.xlsx").
-- Precios por 1, 2 y 3 personas; la capacidad es la cantidad de precios.
insert into public.lodging_rooms(company_id,business_unit_id,code,name,room_type,description,capacity,base_rate,rates_by_guests,display_order)
select bu.company_id,bu.id,v.code,v.name,v.room_type,v.description,v.capacity,v.base_rate,v.rates,v.display_order
from public.business_units bu cross join (values
  ('P1','C1','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',3,27000,'{"1": 27000, "2": 32000, "3": 36000}'::jsonb,1),
  ('P2','C2','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',3,27000,'{"1": 27000, "2": 32000, "3": 36000}'::jsonb,2),
  ('P3','C3','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',3,27000,'{"1": 27000, "2": 32000, "3": 36000}'::jsonb,3),
  ('P4','C4','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',3,27000,'{"1": 27000, "2": 32000, "3": 36000}'::jsonb,4),
  ('P5','C5','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',2,27000,'{"1": 27000, "2": 32000}'::jsonb,5),
  ('P6','C6','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',2,27000,'{"1": 27000, "2": 32000}'::jsonb,6),
  ('P7','C7','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',2,27000,'{"1": 27000, "2": 32000}'::jsonb,7),
  ('P8','C8','Mini depto','MINI DEPTOS 1C MATRIMONIAL, TV, COCINA, FRIGOBAR Y BAÑO PRIVADO',2,27000,'{"1": 27000, "2": 32000}'::jsonb,8),
  ('P9','HAB1','Simple matrimonial','HAB. SIMPLE 1C MATRIMONIAL, TV Y BAÑO PRIVADO',2,24000,'{"1": 24000, "2": 29000}'::jsonb,9),
  ('P10','HAB2','Simple individual','HAB. SIMPLE 1C INDIVIDUAL, TV Y BAÑO PRIVADO',1,24000,'{"1": 24000}'::jsonb,10),
  ('P11','HAB3','Simple matrimonial','HAB. SIMPLE 1C MATRIMONIAL, TV Y BAÑO PRIVADO',2,24000,'{"1": 24000, "2": 29000}'::jsonb,11),
  ('P12','HAB4','Simple 2 camas','HAB. SIMPLE 2 CAMAS INDIVIDUALES, TV Y BAÑO PRIVADO',2,24000,'{"1": 24000, "2": 30000}'::jsonb,12),
  ('P13','HAB5','Simple individual','HAB. SIMPLE 1C INDIVIDUAL, TV Y BAÑO PRIVADO',1,24000,'{"1": 24000}'::jsonb,13),
  ('P14','HAB6','Simple matrimonial','HAB. SIMPLE 1C MATRIMONIAL, TV Y BAÑO PRIVADO',2,24000,'{"1": 24000, "2": 29000}'::jsonb,14),
  ('P15','HAB7','Simple matrimonial','HAB. SIMPLE 1C MATRIMONIAL, TV Y BAÑO PRIVADO',2,24000,'{"1": 24000, "2": 29000}'::jsonb,15)
) as v(code,name,room_type,description,capacity,base_rate,rates,display_order)
where bu.code='HOB' and bu.deleted_at is null
on conflict (business_unit_id,code) do nothing;

commit;
