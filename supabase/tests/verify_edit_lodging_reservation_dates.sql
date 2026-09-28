\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set clerk_id '00000000-0000-4000-8000-0000000d0001'
\set maid_id '00000000-0000-4000-8000-0000000d0003'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'clerk_id','authenticated','authenticated','dates-clerk@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'clerk_id',(select id from public.roles where key='receptionist'),'Fechas','Recepción','dates-clerk@local.test','Pruebas',:'clerk_id');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'maid_id','authenticated','authenticated','dates-maid@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'maid_id',(select id from public.roles where key='housekeeping'),'Fechas','Aseo','dates-maid@local.test','Pruebas',:'clerk_id');
insert into public.user_companies(user_id,company_id) values(:'clerk_id',:'company_id'),(:'maid_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id)
values(:'clerk_id',:'company_id',:'hu_unit_id'),(:'maid_id',:'company_id',:'hu_unit_id');

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,capacity,base_rate)
values
 ('00000000-0000-4000-8000-0000000d1001',:'company_id',:'hu_unit_id','DATES-1','Fechas 1',2,100),
 ('00000000-0000-4000-8000-0000000d1002',:'company_id',:'hu_unit_id','DATES-2','Fechas 2',2,100);

insert into public.lodging_reservations(
  id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,
  nightly_rate,discount,surcharge,total_value,imported_from_ical
) values
 ('00000000-0000-4000-8000-0000000d2001',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000d1001','direct','confirmed',current_date+1,current_date+3,100,10,5,195,false),
 ('00000000-0000-4000-8000-0000000d2002',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000d1001','direct','confirmed',current_date+5,current_date+7,100,0,0,200,false),
 ('00000000-0000-4000-8000-0000000d2003',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000d1002','booking','confirmed',current_date+1,current_date+3,0,0,0,0,true),
 ('00000000-0000-4000-8000-0000000d2004',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000d1002','direct','checked_out',current_date-4,current_date-2,100,0,0,200,false);

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);

select public.update_lodging_reservation_dates(
  '00000000-0000-4000-8000-0000000d2001', current_date+2, current_date+5
);

do $$
declare r public.lodging_reservations%rowtype; failed boolean := false;
begin
  select * into r from public.lodging_reservations
  where id='00000000-0000-4000-8000-0000000d2001';
  if r.check_in<>current_date+2 or r.check_out<>current_date+5 or r.nights<>3 or r.total_value<>295 then
    raise exception 'Fechas o total incorrectos: %',to_jsonb(r);
  end if;

  begin
    perform public.update_lodging_reservation_dates(
      '00000000-0000-4000-8000-0000000d2001', current_date+2, current_date+6
    );
  exception when exclusion_violation then failed := true;
  end;
  if not failed then raise exception 'Permitió solapar dos reservas manuales'; end if;

  failed := false;
  begin
    perform public.update_lodging_reservation_dates(
      '00000000-0000-4000-8000-0000000d2003', current_date+2, current_date+4
    );
  exception when raise_exception then failed := true;
  end;
  if not failed then raise exception 'Permitió editar una reserva iCal'; end if;

  -- Una reserva ya finalizada no cambia de fechas.
  failed := false;
  begin
    perform public.update_lodging_reservation_dates('00000000-0000-4000-8000-0000000d2004', current_date-5, current_date-2);
  exception when raise_exception then failed := sqlerrm like '%finalizada o anulada%';
  end;
  if not failed then raise exception 'Permitió editar una reserva finalizada'; end if;

  -- Un UPDATE directo no puede imponer un total: la base lo recalcula.
  update public.lodging_reservations set check_out=current_date+4, total_value=1
  where id='00000000-0000-4000-8000-0000000d2001';
  select * into r from public.lodging_reservations where id='00000000-0000-4000-8000-0000000d2001';
  if r.total_value is distinct from 195::numeric then raise exception 'Total impuesto desde el navegador: %',r.total_value; end if;
end $$;

-- Aseo no puede modificar fechas.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid_id'),true);
do $$ declare failed boolean := false;
begin
  begin
    perform public.update_lodging_reservation_dates('00000000-0000-4000-8000-0000000d2002', current_date+6, current_date+8);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'Aseo modificó fechas'; end if;
end $$;

reset role;
do $$
begin
  if not exists(
    select 1 from public.audit_logs
    where entity_id='00000000-0000-4000-8000-0000000d2001'
      and action='update_reservation_dates'
  ) then
    raise exception 'No se registró la edición en auditoría';
  end if;
end $$;

select 'edit reservation dates ok' as result;
rollback;
