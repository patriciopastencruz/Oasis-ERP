\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
select id as hoc_unit_id from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set admin_id '00000000-0000-4000-8000-0000000f0001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'admin_id','authenticated','authenticated','apiguard-admin@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'admin_id',(select id from public.roles where key='superadmin'),'Guardia','Admin','apiguard-admin@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'hu_unit_id');

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,capacity,base_rate,active)
values('00000000-0000-4000-8000-0000000f1001',:'company_id',:'hu_unit_id','GUARD-1','Guardia 1',2,100,true),
      ('00000000-0000-4000-8000-0000000f1002',:'company_id',:'hu_unit_id','GUARD-2','Guardia 2',2,100,true),
      ('00000000-0000-4000-8000-0000000f1003',:'company_id',:'hu_unit_id','GUARD-3','Guardia 3',2,100,false);
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,discount,surcharge,total_value,imported_from_ical)
values('00000000-0000-4000-8000-0000000f2001',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000f1001','direct','confirmed',current_date+20,current_date+22,100,0,0,200,false),
      ('00000000-0000-4000-8000-0000000f2002',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000f1001','direct','cancelled',current_date+30,current_date+31,100,0,0,100,false);

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

do $$
declare failed boolean;
begin
  -- Anular, cerrar o reactivar directo por la API no se permite.
  failed := false;
  begin update public.lodging_reservations set status='cancelled' where id='00000000-0000-4000-8000-0000000f2001';
  exception when others then failed := sqlerrm like 'Ese cambio se hace desde las acciones%'; end;
  if not failed then raise exception 'Se anuló directo por la API'; end if;

  failed := false;
  begin update public.lodging_reservations set status='confirmed' where id='00000000-0000-4000-8000-0000000f2002';
  exception when others then failed := sqlerrm like 'Ese cambio se hace desde las acciones%'; end;
  if not failed then raise exception 'Se reactivó una anulada por la API'; end if;

  -- Total y marca de importada.
  -- El total se recalcula desde la tarifa (guard_lodging_reservation_price): no se puede fijar a mano.
  update public.lodging_reservations set total_value=1 where id='00000000-0000-4000-8000-0000000f2001';
  if (select total_value from public.lodging_reservations where id='00000000-0000-4000-8000-0000000f2001')<>200 then
    raise exception 'Se cambió el total directo';
  end if;

  failed := false;
  begin update public.lodging_reservations set imported_from_ical=true where id='00000000-0000-4000-8000-0000000f2001';
  exception when others then failed := sqlerrm like 'Ese cambio se hace desde las acciones%'; end;
  if not failed then raise exception 'Se marcó como importada'; end if;

  -- Crear con un total que no cuadra.
  failed := false;
  begin
    insert into public.lodging_reservations(company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value)
    select company_id,business_unit_id,'00000000-0000-4000-8000-0000000f1002','direct','confirmed',current_date+40,current_date+45,100,1
    from public.lodging_reservations where id='00000000-0000-4000-8000-0000000f2001';
  exception when others then failed := sqlerrm like 'El total no corresponde%'; end;
  if not failed then raise exception 'Se creó una reserva con un total que no cuadra'; end if;
  insert into public.lodging_reservations(company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value)
  select company_id,business_unit_id,'00000000-0000-4000-8000-0000000f1002','direct','confirmed',current_date+40,current_date+45,100,500
  from public.lodging_reservations where id='00000000-0000-4000-8000-0000000f2001';

  -- Cambio de habitación: a una inactiva no; a una activa sí, y queda auditado.
  failed := false;
  begin update public.lodging_reservations set room_id='00000000-0000-4000-8000-0000000f1003' where id='00000000-0000-4000-8000-0000000f2001';
  exception when others then failed := sqlerrm like 'Habitacion no valida%'; end;
  if not failed then raise exception 'Se movió a una habitación inactiva'; end if;
  update public.lodging_reservations set room_id='00000000-0000-4000-8000-0000000f1002' where id='00000000-0000-4000-8000-0000000f2001';

  failed := false;
  begin update public.lodging_reservations set room_id='00000000-0000-4000-8000-0000000f1002' where id='00000000-0000-4000-8000-0000000f2002';
  exception when others then failed := sqlerrm like 'La reserva ya no se puede cambiar%'; end;
  if not failed then raise exception 'Se movió una reserva anulada'; end if;

  -- Los cambios permitidos siguen funcionando.
  update public.lodging_reservations set notes='Llega tarde', guest_count=2 where id='00000000-0000-4000-8000-0000000f2001';
end $$;

reset role;
do $$
begin
  if not exists(select 1 from public.audit_logs where entity_id='00000000-0000-4000-8000-0000000f2001' and action='change_room') then
    raise exception 'El cambio de habitación no quedó auditado';
  end if;
  -- Las funciones del sistema siguen pudiendo anular.
  update public.lodging_reservations set status='cancelled' where id='00000000-0000-4000-8000-0000000f2001';
end $$;

rollback;
