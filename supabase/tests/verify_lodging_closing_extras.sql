\set ON_ERROR_STOP on
begin;

-- Verifica los bloques nuevos del cierre diario: reservas por origen,
-- disponibilidad de los últimos 10 días, venta promedio acumulada del mes por
-- tipo y tiempo promedio de aseo. Datos en enero de 2020 (sin otra actividad).

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
\set a '00000000-0000-4000-8000-0000000e5001'
\set b '00000000-0000-4000-8000-0000000e5002'

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,room_type,display_order) values
 (:'a',:'company_id',:'hu','EXA','Extra A','Suite prueba',91),
 (:'b',:'company_id',:'hu','EXB','Extra B','Doble prueba',92);

-- Suite: Airbnb 08→11 ($90.000 = $30.000/noche) y directa 11→13 ($100.000 = $50.000/noche).
-- Doble: Booking 10→12 ($40.000 = $20.000/noche).
insert into public.lodging_reservations(company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value,imported_from_ical) values
 (:'company_id',:'hu',:'a','airbnb','checked_out','2020-01-08','2020-01-11',30000,90000,false),
 (:'company_id',:'hu',:'a','direct','checked_in','2020-01-11','2020-01-13',50000,100000,false),
 (:'company_id',:'hu',:'b','booking','checked_in','2020-01-10','2020-01-12',20000,40000,false);

-- Aseo: 30 min el 11-01 y 50 min el 05-01.
insert into public.lodging_housekeeping_tasks(company_id,business_unit_id,room_id,origin,status,attempt,completed_at,duration_minutes,checklist) values
 (:'company_id',:'hu',:'a','checkout','completed',1,timestamp '2020-01-11 13:00' at time zone 'America/Santiago',30,'{}'),
 (:'company_id',:'hu',:'b','checkout','completed',1,timestamp '2020-01-05 13:00' at time zone 'America/Santiago',50,'{}');

do $$
declare m jsonb := public.lodging_closing_metrics_internal((select id from public.business_units where code='HU'), '2020-01-11');
  o jsonb; t jsonb; av jsonb;
begin
  -- Los indicadores de siempre siguen presentes.
  if not (m ? 'occupied_rooms' and m ? 'by_type' and m ? 'payments_by_method') then raise exception 'Faltan indicadores base'; end if;

  -- Noche del 11: directa en Suite (llega hoy) y Booking en Doble.
  select e into o from jsonb_array_elements(m->'by_origin') e where e->>'origin'='direct';
  if (o->>'rooms')::int is distinct from 1 or (o->>'revenue')::int is distinct from 50000 or (o->>'arrivals')::int is distinct from 1 then raise exception 'Directa: %',o; end if;
  select e into o from jsonb_array_elements(m->'by_origin') e where e->>'origin'='booking';
  if (o->>'rooms')::int is distinct from 1 or (o->>'revenue')::int is distinct from 20000 or (o->>'arrivals')::int is distinct from 0 then raise exception 'Booking: %',o; end if;
  if exists(select 1 from jsonb_array_elements(m->'by_origin') e where e->>'origin'='airbnb') then raise exception 'Airbnb ya salió el 11'; end if;
  if (m->'by_origin'->0->>'origin') is distinct from 'direct' then raise exception 'Orden por venta'; end if;

  -- Disponibilidad: 10 días del 02 al 11; ocupadas del grupo de prueba.
  if jsonb_array_length(m->'availability_10d') <> 10 or m->'availability_10d'->0->>'date' <> '2020-01-02' or m->'availability_10d'->9->>'date' <> '2020-01-11' then raise exception 'Rango de 10 días'; end if;
  select e into av from jsonb_array_elements(m->'availability_10d') e where e->>'date'='2020-01-10';
  if (av->>'occupied')::int is distinct from 2 then raise exception 'Ocupadas el 10: %',av; end if;
  select e into av from jsonb_array_elements(m->'availability_10d') e where e->>'date'='2020-01-07';
  if (av->>'occupied')::int is distinct from 0 or (av->>'total')::int < 2 then raise exception 'Día 07: %',av; end if;

  -- Mes al 11: Suite 3 noches Airbnb (30.000) + 1 directa (50.000) = 35.000 prom.; Doble 2 noches a 20.000.
  select e into t from jsonb_array_elements(m->'month_by_type') e where e->>'room_type'='Suite prueba';
  if (t->>'nights')::int is distinct from 4 or (t->>'average_rate')::int is distinct from 35000 then raise exception 'Suite mes: %',t; end if;
  select e into t from jsonb_array_elements(m->'month_by_type') e where e->>'room_type'='Doble prueba';
  if (t->>'nights')::int is distinct from 2 or (t->>'average_rate')::int is distinct from 20000 then raise exception 'Doble mes: %',t; end if;

  -- Aseo: hoy 30 min (1); mes 40 min (2).
  if (m->'cleaning'->>'day_avg_minutes')::int is distinct from 30 or (m->'cleaning'->>'day_count')::int is distinct from 1
     or (m->'cleaning'->>'month_avg_minutes')::int is distinct from 40 or (m->'cleaning'->>'month_count')::int is distinct from 2 then
    raise exception 'Aseo: %',m->'cleaning';
  end if;
end $$;

select 'lodging closing extras ok' as result;
rollback;
