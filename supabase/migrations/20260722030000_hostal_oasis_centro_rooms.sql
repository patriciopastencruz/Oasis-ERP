begin;

-- Habilita el modulo de Reservas para Hostal Oasis Centro (HOC), que ya
-- comparte el mismo esquema que Hostal Uruguay (lodging_rooms es
-- generico por business_unit_id). Solo falta la carga inicial de
-- habitaciones; capacidad 2 y tarifa base $30.000 para todas, ajustable
-- despues desde la pantalla de habitaciones.

insert into public.lodging_rooms(company_id,business_unit_id,code,name,description,capacity,base_rate,display_order)
select bu.company_id,bu.id,x.code,x.name,x.description,2,30000,x.ord
from public.business_units bu
cross join (values
 ('MOD2','Modular 2',null,1),
 ('MOD3','Modular 3',null,2),
 ('MOD4','Modular 4 (2C 1PL)','2 camas de 1 plaza',3),
 ('MOD5','Modular 5',null,4),
 ('MOD6','Modular 6',null,5),
 ('MOD7','Modular 7',null,6),
 ('MOD8','Modular 8',null,7),
 ('MOD9','Modular 9',null,8),
 ('DEP10','Departamento 10',null,9),
 ('PZ11','Pieza 11 (1C 2PL)','1 cama de 2 plazas',10),
 ('PZ12','Pieza 12 (2C 1PL)','2 camas de 1 plaza',11),
 ('PZ13','Pieza 13 (1C 1.5PL)','1 cama de 1.5 plazas',12),
 ('PZ14','Pieza 14 (1C 2PL)','1 cama de 2 plazas',13),
 ('PZ15','Pieza 15 (2C 1PL)','2 camas de 1 plaza',14),
 ('PZ16','Pieza 16 (1C 1.5PL)','1 cama de 1.5 plazas',15),
 ('PZ18','Pieza 18',null,16)
) as x(code,name,description,ord)
where bu.code='HOC'
on conflict(business_unit_id,code) do nothing;

commit;
