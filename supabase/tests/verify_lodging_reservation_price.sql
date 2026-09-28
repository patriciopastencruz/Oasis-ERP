\set ON_ERROR_STOP on
begin;

-- Verifica la corrección del precio de una reserva directa: la base
-- recalcula el total (noches × tarifa − descuento + recargo), exige motivo,
-- registra en audit_logs, no acepta totales enviados directamente, no aplica
-- a iCal ni a anuladas, y con check-out solo lo corrige el administrador.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
\set clerk '00000000-0000-4000-8000-0000000b5001'
\set admin '00000000-0000-4000-8000-0000000b5002'
\set maid '00000000-0000-4000-8000-0000000b5003'
\set room '00000000-0000-4000-8000-0000000b6001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@price.test','x',now(),now(),now() from unnest(array[:'clerk',:'admin',:'maid']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@price.test','Pruebas',:'clerk'),
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@price.test','Pruebas',:'clerk'),
 (:'maid',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid'||'@price.test','Pruebas',:'clerk');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'clerk',:'admin',:'maid']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'clerk',:'admin',:'maid']) v;

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order) values(:'room',:'company_id',:'hu','PX1','Precio 1',99);
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,discount,surcharge,total_value,imported_from_ical) values
 ('00000000-0000-4000-8000-0000000b7001',:'company_id',:'hu',:'room','direct','confirmed',current_date+1,current_date+4,30000,0,0,90000,false),
 ('00000000-0000-4000-8000-0000000b7002',:'company_id',:'hu',:'room','booking','confirmed',current_date+5,current_date+6,0,0,0,50000,true),
 ('00000000-0000-4000-8000-0000000b7003',:'company_id',:'hu',:'room','direct','checked_out',current_date-4,current_date-2,20000,0,0,40000,false),
 ('00000000-0000-4000-8000-0000000b7004',:'company_id',:'hu',:'room','direct','cancelled',current_date+8,current_date+9,20000,0,0,20000,false);
insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
values(:'company_id',:'hu','00000000-0000-4000-8000-0000000b7001','deposit','transfer',50000,now(),:'clerk');

create function pg_temp.res(r uuid) returns text language sql security definer as $$ select nightly_rate::int||'/'||discount::int||'/'||surcharge::int||'/'||total_value::int from public.lodging_reservations where id=r $$;

set local role authenticated;

-- ---------- Aseo no corrige precios ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7001',35000,0,0,'Tarifa mal ingresada'); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo corrigió un precio'; end if;
end $$;

-- ---------- Recepción corrige ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare r jsonb; failed boolean := false;
begin
  begin perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7001',35000,0,0,'no'); exception when others then failed := sqlerrm like '%motivo%'; end;
  if not failed then raise exception 'Exige motivo'; end if;
  r := public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7001',35000,5000,2000,'Tarifa mal ingresada al crear');
  -- 3 noches × 35.000 − 5.000 + 2.000 = 102.000; pagado 50.000 → saldo 52.000.
  if pg_temp.res('00000000-0000-4000-8000-0000000b7001') is distinct from '35000/5000/2000/102000' then raise exception 'Total recalculado: %',pg_temp.res('00000000-0000-4000-8000-0000000b7001'); end if;
  if (r->>'balance')::numeric is distinct from 52000::numeric then raise exception 'Saldo: %',r; end if;
  failed := false;
  begin perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7001',10000,50000,0,'Descuento enorme por error'); exception when others then failed := sqlerrm like '%negativo%'; end;
  if not failed then raise exception 'Total negativo'; end if;
  failed := false;
  begin perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7002',40000,0,0,'Precio de Booking'); exception when others then failed := sqlerrm like '%Completar informacion interna%'; end;
  if not failed then raise exception 'iCal usa su propio flujo'; end if;
  failed := false;
  begin perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7004',30000,0,0,'Reserva anulada'); exception when others then failed := sqlerrm like '%anulada%'; end;
  if not failed then raise exception 'Anulada no se corrige'; end if;
  failed := false;
  begin perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7003',25000,0,0,'Se cobró distinto'); exception when others then failed := sqlerrm like '%Solo el administrador%'; end;
  if not failed then raise exception 'Con check-out solo el administrador'; end if;

  -- Un UPDATE directo no puede imponer el total.
  update public.lodging_reservations set total_value=1 where id='00000000-0000-4000-8000-0000000b7001';
  if pg_temp.res('00000000-0000-4000-8000-0000000b7001') is distinct from '35000/5000/2000/102000' then raise exception 'Total impuesto desde el navegador'; end if;
end $$;

-- ---------- Administrador corrige una con check-out ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$
begin
  perform public.update_lodging_reservation_price('00000000-0000-4000-8000-0000000b7003',25000,0,0,'Se cobró distinto');
  if pg_temp.res('00000000-0000-4000-8000-0000000b7003') is distinct from '25000/0/0/50000' then raise exception 'Admin con check-out'; end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.audit_logs where action='update_reservation_price' and entity_id in('00000000-0000-4000-8000-0000000b7001','00000000-0000-4000-8000-0000000b7003')) is distinct from 2::bigint then raise exception 'Auditoría del cambio de precio'; end if;
  if (select new_data->>'reason' from public.audit_logs where action='update_reservation_price' and entity_id='00000000-0000-4000-8000-0000000b7001') is distinct from 'Tarifa mal ingresada al crear' then raise exception 'Motivo en auditoría'; end if;
end $$;

select 'lodging reservation price ok' as result;
rollback;
