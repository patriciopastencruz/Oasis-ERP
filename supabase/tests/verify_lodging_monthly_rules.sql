\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin_id '00000000-0000-4000-8000-0000000b9001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'admin_id','authenticated','authenticated','mrules-admin@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'admin_id',(select id from public.roles where key='superadmin'),'Mes','Admin','mrules-admin@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'hu_unit_id');

-- Aislar la unidad: sin reservas vigentes previas.
update public.lodging_reservations set status='cancelled' where business_unit_id=:'hu_unit_id' and status not in('cancelled','conflict');

create temp table ctx as select
 (date_trunc('month',(now() at time zone 'America/Santiago'))-interval '1 month')::date as m,
 (select id from public.lodging_rooms where business_unit_id=:'hu_unit_id' order by display_order limit 1) as room;
grant select on ctx to authenticated;

-- Estadía de 4 noches que cruza al mes siguiente: 2 noches en el mes anterior, comisión 40.000.
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value,commission)
select '00000000-0000-4000-8000-0000000b9101'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,room,'booking','checked_out',
 (m+interval '1 month')::date-2,(m+interval '1 month')::date+2,100,400,40000 from ctx;
insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
select :'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000b9101'::uuid,'total','transfer',400,now()-interval '1 hour',:'admin_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

do $$
declare hu uuid := (select business_unit_id from public.lodging_reservations where id='00000000-0000-4000-8000-0000000b9101');
  m date := (select m from ctx); s jsonb; failed boolean := false; cur uuid;
begin
  -- La comisión se reparte por noches igual que la venta.
  s := public.lodging_monthly_summary(hu,m);
  if (s->'sales'->>'total')::numeric<>200 or (s->'commissions'->>'amount')::numeric<>20000 then
    raise exception 'Venta o comisión mal prorrateadas: % / %', s->'sales', s->'commissions';
  end if;

  -- El mes en curso no se cierra.
  cur := public.lodging_monthly_start(hu,(now() at time zone 'America/Santiago')::date);
  begin perform public.lodging_monthly_close(cur,'Antes de tiempo');
  exception when others then failed := sqlerrm like 'El mes todavia no termina%'; end;
  if not failed then raise exception 'Se cerró el mes en curso'; end if;

  -- Una devolución no supera lo pagado.
  failed := false;
  begin
    insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,registered_by)
    select company_id,business_unit_id,id,'refund','transfer',500,auth.uid() from public.lodging_reservations where id='00000000-0000-4000-8000-0000000b9101';
  exception when others then failed := sqlerrm like 'La devolucion no puede superar%'; end;
  if not failed then raise exception 'Se aceptó una devolución mayor a lo pagado'; end if;
end $$;

rollback;
