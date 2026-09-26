\set ON_ERROR_STOP on
begin;

-- Verifica el cierre diario de hostal: indicadores calculados desde reservas
-- y pagos del día (zona Santiago), venta promedio por tipo, monto pendiente,
-- gastos manuales, emisión, destinatarios del correo y la regla de que
-- recepción solo puede cerrar hoy o el día anterior.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin_id '00000000-0000-4000-8000-0000000a0001'
\set clerk_id '00000000-0000-4000-8000-0000000a0002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'admin_id','authenticated','authenticated','closing-admin@local.test','x',now(),now(),now()),
 (:'clerk_id','authenticated','authenticated','closing-clerk@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='administrator'),'Cierre','Admin','closing-admin@local.test','Pruebas',:'admin_id'),
 (:'clerk_id',(select id from public.roles where key='receptionist'),'Cierre','Recepción','closing-clerk@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'admin_id',:'company_id',:'hu_unit_id'),(:'clerk_id',:'company_id',:'hu_unit_id');

-- Habitaciones propias de la prueba (las existentes se desactivan dentro de
-- la transacción): T1-T2 Modulares, T3-T4 Habitación, T5 fuera de servicio.
update public.lodging_rooms set active=false where business_unit_id=:'hu_unit_id';
insert into public.lodging_rooms(company_id,business_unit_id,code,name,room_type,status,display_order) values
 (:'company_id',:'hu_unit_id','T1','Test 1','Modulares','available',1),
 (:'company_id',:'hu_unit_id','T2','Test 2','Modulares','available',2),
 (:'company_id',:'hu_unit_id','T3','Test 3','Habitación','available',3),
 (:'company_id',:'hu_unit_id','T4','Test 4','Habitación','available',4),
 (:'company_id',:'hu_unit_id','T5','Test 5','Habitación','out_of_service',5);

create temp table ids as select
 (now() at time zone 'America/Santiago')::date as today,
 (select id from public.lodging_rooms where business_unit_id=:'hu_unit_id' and code='T1') as p1,
 (select id from public.lodging_rooms where business_unit_id=:'hu_unit_id' and code='T2') as p2,
 (select id from public.lodging_rooms where business_unit_id=:'hu_unit_id' and code='T3') as p3;
grant select on ids to authenticated;

-- T1: 2 noches, $60.000 (30.000/noche), pagado 50% en transferencia hoy.
-- T2: 1 noche, $40.000, pagado completo en efectivo hoy; menos un reembolso de 5.000.
-- T3: llega hoy, 3 noches, $75.000, sin pago (pendiente 75.000). Otra reserva cancelada no cuenta.
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,total_value,guest_count)
select '00000000-0000-4000-8000-0000000a1001'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,p1,'direct','checked_in',today-1,today+1,60000,2 from ids union all
select '00000000-0000-4000-8000-0000000a1002',:'company_id',:'hu_unit_id',p2,'direct','checked_in',today,today+1,40000,1 from ids union all
select '00000000-0000-4000-8000-0000000a1003',:'company_id',:'hu_unit_id',p3,'direct','confirmed',today,today+3,75000,3 from ids union all
select '00000000-0000-4000-8000-0000000a1004',:'company_id',:'hu_unit_id',p3,'direct','cancelled',today-5,today+5,99999,1 from ids;
insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
values
 (:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000a1001','deposit','transfer',30000,now(),:'admin_id'),
 (:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000a1002','total','cash',40000,now(),:'admin_id'),
 (:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000a1002','refund','cash',5000,now(),:'admin_id'),
 -- Pago de otro día: no suma en el cierre de hoy pero sí descuenta pendiente.
 (:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000a1003','deposit','card',10000,now()-interval '3 days',:'admin_id');

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);

do $$
declare
  hu uuid := (select id from public.business_units where code='HU');
  today date := (select today from ids);
  m jsonb; c public.lodging_daily_closings; closing uuid; failed boolean; recipients int;
begin
  m := public.lodging_closing_metrics(hu,today);
  if (m->>'total_rooms')::int<>4 or (m->>'occupied_rooms')::int<>3 or (m->>'occupancy_pct')::numeric<>75 then
    raise exception 'Ocupación incorrecta: %',m; end if;
  if (m->'payments_by_method'->>'transfer')::numeric<>30000 or (m->'payments_by_method'->>'cash')::numeric<>35000
     or (m->>'total_received')::numeric<>65000 or (m->'payments_by_method'->>'card')::numeric<>0 then
    raise exception 'Pagos del día incorrectos: %',m->'payments_by_method'; end if;
  -- Pendiente: T1 60.000-30.000 + T2 40.000-35.000 + T3 75.000-10.000.
  if (m->>'pending_amount')::numeric<>100000 then raise exception 'Pendiente incorrecto: %',m->'pending'; end if;
  -- Modulares: (30.000 + 40.000)/2 = 35.000. Habitación: 25.000.
  if (select (t->>'average_rate')::numeric from jsonb_array_elements(m->'by_type') t where t->>'room_type'='Modulares')<>35000
     or (select (t->>'average_rate')::numeric from jsonb_array_elements(m->'by_type') t where t->>'room_type'='Habitación')<>25000 then
    raise exception 'Venta promedio por tipo incorrecta: %',m->'by_type'; end if;
  if (m->>'arrivals')::int<>2 or (m->>'guests')::int<>6 then raise exception 'Llegadas/huéspedes incorrectos: %',m; end if;

  closing := public.lodging_save_daily_closing(hu,today,jsonb_build_object(
    'observations','Falta ingresar Modular 8','reported_problems','Ducha P2 gotea','items_to_replenish','Toallas',
    'total_received',1,
    'expenses',jsonb_build_array(jsonb_build_object('description','Gas','amount',1150,'payment_method','cash'))));
  -- Guardar otra vez reemplaza los gastos (el anterior queda con deleted_at).
  closing := public.lodging_save_daily_closing(hu,today,jsonb_build_object(
    'observations','Falta ingresar Modular 8',
    'expenses',jsonb_build_array(jsonb_build_object('description','Gas','amount',1150),jsonb_build_object('description','Pan','amount',2000))));
  select * into c from public.lodging_daily_closings where id=closing;
  if c.status<>'draft' or c.expense_total<>3150 or c.total_received<>65000 or c.net_result<>61850 or c.reported_problems is not null then
    raise exception 'Borrador incorrecto: % % % %',c.status,c.expense_total,c.total_received,c.net_result; end if;
  if (select count(*) from public.lodging_daily_closing_expenses where closing_id=closing)<>3 then
    raise exception 'Los gastos reemplazados deben conservarse con deleted_at'; end if;

  perform public.lodging_issue_daily_closing(closing);
  select * into c from public.lodging_daily_closings where id=closing;
  if c.status<>'issued' or c.issued_at is null or c.version<>1 then raise exception 'No se emitió'; end if;

  select count(*) into recipients from public.lodging_closing_email_recipients(closing) where email='closing-admin@local.test';
  if recipients<>1 then raise exception 'El administrador debe recibir el correo'; end if;
  if exists(select 1 from public.lodging_closing_email_recipients(closing) where email='closing-clerk@local.test') then
    raise exception 'La recepcionista no debe estar entre los destinatarios'; end if;

  -- Recepción no puede corregir un cierre emitido ni cerrar fechas antiguas.
  failed := false;
  begin perform public.lodging_save_daily_closing(hu,today,'{}'::jsonb); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción corrigió un cierre emitido'; end if;
  failed := false;
  begin perform public.lodging_save_daily_closing(hu,today-2,'{}'::jsonb); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción cerró una fecha antigua'; end if;
  failed := false;
  begin perform public.lodging_save_daily_closing(hu,today+1,'{}'::jsonb); exception when others then failed := true; end;
  if not failed then raise exception 'Se cerró una fecha futura'; end if;
  -- El día anterior sí se permite.
  perform public.lodging_save_daily_closing(hu,today-1,'{}'::jsonb);
end $$;

-- El administrador sí puede corregir el cierre emitido y cerrar fechas antiguas.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); today date := (select today from ids);
begin
  perform public.lodging_save_daily_closing(hu,today,'{"observations":"Corregido"}'::jsonb);
  if (select status from public.lodging_daily_closings where business_unit_id=hu and closing_date=today)<>'draft' then
    raise exception 'La corrección debe volver el cierre a borrador'; end if;
  perform public.lodging_save_daily_closing(hu,today-10,'{}'::jsonb);
end $$;

select 'lodging daily closing ok' as result;
rollback;
