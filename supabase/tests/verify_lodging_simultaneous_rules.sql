\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin_id '00000000-0000-4000-8000-0000000c0001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'admin_id','authenticated','authenticated','simul-admin@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'admin_id',(select id from public.roles where key='superadmin'),'Simul','Admin','simul-admin@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'hu_unit_id');

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,capacity,base_rate,operational_status)
values('00000000-0000-4000-8000-0000000c1001',:'company_id',:'hu_unit_id','SIM-A','Simul A',2,100,'inspected'),
      ('00000000-0000-4000-8000-0000000c1002',:'company_id',:'hu_unit_id','SIM-B','Simul B',2,100,'inspected'),
      ('00000000-0000-4000-8000-0000000c1003',:'company_id',:'hu_unit_id','SIM-C','Simul C',2,100,'inspected'),
      ('00000000-0000-4000-8000-0000000c1004',:'company_id',:'hu_unit_id','SIM-D','Simul D',1,100,'inspected');
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,guest_count,nightly_rate,total_value,simultaneous)
values
 ('00000000-0000-4000-8000-0000000c2001',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000c1001','direct','confirmed',current_date+1,current_date+3,2,100,200,false),
 ('00000000-0000-4000-8000-0000000c2002',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000c1001','direct','confirmed',current_date+1,current_date+3,2,100,200,true),
 ('00000000-0000-4000-8000-0000000c2003',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000c1002','direct','confirmed',current_date+1,current_date+3,2,100,200,false),
 ('00000000-0000-4000-8000-0000000c2004',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000c1003','direct','confirmed',current_date+10,current_date+11,1,100,100,false),
 ('00000000-0000-4000-8000-0000000c2005',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000c1003','direct','confirmed',current_date,current_date+1,1,100,100,false);

do $$
declare failed boolean;
begin
  -- La simultánea puede ajustar fechas dentro de lo que ya cruzaba.
  update public.lodging_reservations set check_out=current_date+2 where id='00000000-0000-4000-8000-0000000c2002';
  if not (select simultaneous from public.lodging_reservations where id='00000000-0000-4000-8000-0000000c2002') then
    raise exception 'Debía seguir siendo simultánea';
  end if;

  -- Moverla a otra pieza ocupada por una reserva que no cruzaba: no.
  failed := false;
  begin update public.lodging_reservations set room_id='00000000-0000-4000-8000-0000000c1002' where id='00000000-0000-4000-8000-0000000c2002';
  exception when others then failed := sqlerrm like 'La habitacion ya esta reservada%'; end;
  if not failed then raise exception 'La simultánea se movió encima de otra reserva'; end if;

  -- Moverla a una pieza libre: deja de ser simultánea.
  update public.lodging_reservations set room_id='00000000-0000-4000-8000-0000000c1003' where id='00000000-0000-4000-8000-0000000c2002';
  if (select simultaneous from public.lodging_reservations where id='00000000-0000-4000-8000-0000000c2002') then
    raise exception 'En una pieza libre debía dejar de ser simultánea';
  end if;

  -- Capacidad de la pieza de destino.
  failed := false;
  begin update public.lodging_reservations set room_id='00000000-0000-4000-8000-0000000c1004' where id='00000000-0000-4000-8000-0000000c2003';
  exception when others then failed := sqlerrm like 'La habitacion no admite%'; end;
  if not failed then raise exception 'Se movió a una pieza sin capacidad'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

do $$
declare failed boolean := false;
begin
  -- Check-in solo entre la llegada y la salida.
  begin perform public.lodging_check_in('00000000-0000-4000-8000-0000000c2004', null);
  exception when others then failed := sqlerrm like 'El check-in se hace entre%'; end;
  if not failed then raise exception 'Se hizo check-in de una reserva futura'; end if;
  perform public.lodging_check_in('00000000-0000-4000-8000-0000000c2005', null);
end $$;

rollback;
