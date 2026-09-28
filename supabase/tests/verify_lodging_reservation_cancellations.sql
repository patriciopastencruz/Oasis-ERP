\set ON_ERROR_STOP on
begin;

-- Verifica la anulación de reservas con aprobación: recepción solicita con
-- motivo, el administrador (o superior) aprueba o rechaza; quien ya puede
-- aprobar anula al instante; aviso a aprobadores y a quien pidió; nada se
-- borra y queda en audit_logs; reservas iCal, en curso o finalizadas no se
-- anulan; aseo no puede solicitar.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
\set clerk '00000000-0000-4000-8000-0000000a1001'
\set admin '00000000-0000-4000-8000-0000000a1002'
\set maid '00000000-0000-4000-8000-0000000a1003'
\set room '00000000-0000-4000-8000-0000000a2001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@cancel.test','x',now(),now(),now() from unnest(array[:'clerk',:'admin',:'maid']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@cancel.test','Pruebas',:'clerk'),
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@cancel.test','Pruebas',:'clerk'),
 (:'maid',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid'||'@cancel.test','Pruebas',:'clerk');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'clerk',:'admin',:'maid']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'clerk',:'admin',:'maid']) v;

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order) values(:'room',:'company_id',:'hu','CX1','Anular 1',99);
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,total_value,imported_from_ical) values
 ('00000000-0000-4000-8000-0000000a3001',:'company_id',:'hu',:'room','direct','confirmed',current_date+10,current_date+12,100,200,false),
 ('00000000-0000-4000-8000-0000000a3002',:'company_id',:'hu',:'room','direct','confirmed',current_date+20,current_date+22,100,200,false),
 ('00000000-0000-4000-8000-0000000a3003',:'company_id',:'hu',:'room','booking','confirmed',current_date+30,current_date+32,0,0,true),
 ('00000000-0000-4000-8000-0000000a3004',:'company_id',:'hu',:'room','direct','checked_out',current_date-5,current_date-3,100,200,false),
 ('00000000-0000-4000-8000-0000000a3005',:'company_id',:'hu',:'room','direct','confirmed',current_date+40,current_date+41,100,100,false);
insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
values(:'company_id',:'hu','00000000-0000-4000-8000-0000000a3001','deposit','transfer',80,now(),:'clerk');

-- Estado antes de la prueba (para contar notificaciones nuevas).
create temp table before as select (select count(*) from public.notifications) n;
grant select on before to authenticated;
create function pg_temp.res_status(r uuid) returns text language sql security definer as $$ select status from public.lodging_reservations where id=r $$;
create function pg_temp.notif(event text, r uuid) returns bigint language sql security definer as $$ select count(*) from public.notifications where event_key=event and entity_id=r $$;

set local role authenticated;

-- ---------- Aseo no puede solicitar ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3001','Huésped canceló'); exception when others then failed := true; end;
  if not failed then raise exception 'Aseo solicitó una anulación'; end if;
end $$;

-- ---------- Recepción solicita: queda pendiente ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare r jsonb; failed boolean := false;
begin
  begin perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3001','no'); exception when others then failed := sqlerrm like '%motivo%'; end;
  if not failed then raise exception 'Exige motivo'; end if;
  r := public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3001','El huésped canceló por teléfono');
  if (r->>'applied')::boolean then raise exception 'Recepción no anula directo'; end if;
  if pg_temp.res_status('00000000-0000-4000-8000-0000000a3001') is distinct from 'confirmed' then raise exception 'La reserva sigue activa hasta aprobar'; end if;
  if (select paid_amount from public.lodging_reservation_cancellations where id=(r->>'id')::uuid) is distinct from 80::numeric then raise exception 'Guarda lo pagado'; end if;
  if pg_temp.notif('lodging.cancellation.review_assigned','00000000-0000-4000-8000-0000000a3001') < 1 then raise exception 'Avisa a los aprobadores'; end if;
  failed := false;
  begin perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3001','Otra vez lo mismo'); exception when others then failed := sqlerrm like '%pendiente%'; end;
  if not failed then raise exception 'Una sola pendiente por reserva'; end if;
  failed := false;
  begin perform public.lodging_reservation_cancel_decide((r->>'id')::uuid,true,null); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción no aprueba'; end if;
  -- iCal y finalizadas no se anulan aquí.
  failed := false;
  begin perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3003','Canceló en Booking'); exception when others then failed := sqlerrm like '%plataforma%'; end;
  if not failed then raise exception 'Reserva iCal'; end if;
  failed := false;
  begin perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3004','Ya se fue el huésped'); exception when others then failed := sqlerrm like '%ya no se puede anular%'; end;
  if not failed then raise exception 'Reserva finalizada'; end if;
  perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3002','Cambio de planes del cliente');
end $$;

-- ---------- Administrador aprueba una y rechaza otra ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ declare c1 uuid; c2 uuid; failed boolean := false; r jsonb;
begin
  select id into c1 from public.lodging_reservation_cancellations where reservation_id='00000000-0000-4000-8000-0000000a3001';
  select id into c2 from public.lodging_reservation_cancellations where reservation_id='00000000-0000-4000-8000-0000000a3002';
  perform public.lodging_reservation_cancel_decide(c1,true,null);
  if pg_temp.res_status('00000000-0000-4000-8000-0000000a3001') is distinct from 'cancelled' then raise exception 'Aprobar anula la reserva'; end if;
  if not exists(select 1 from public.lodging_reservations where id='00000000-0000-4000-8000-0000000a3001') then raise exception 'La reserva no se borra'; end if;
  if (select count(*) from public.lodging_reservation_payments where reservation_id='00000000-0000-4000-8000-0000000a3001') is distinct from 1::bigint then raise exception 'Los pagos se conservan'; end if;
  if pg_temp.notif('lodging.cancellation.decided','00000000-0000-4000-8000-0000000a3001') is distinct from 1::bigint then raise exception 'Avisa a quien pidió'; end if;
  begin perform public.lodging_reservation_cancel_decide(c1,true,null); exception when others then failed := sqlerrm like '%ya fue resuelta%'; end;
  if not failed then raise exception 'No se resuelve dos veces'; end if;
  failed := false;
  begin perform public.lodging_reservation_cancel_decide(c2,false,''); exception when others then failed := sqlerrm like '%motivo del rechazo%'; end;
  if not failed then raise exception 'Rechazar exige motivo'; end if;
  perform public.lodging_reservation_cancel_decide(c2,false,'El cliente confirmó que viene');
  if pg_temp.res_status('00000000-0000-4000-8000-0000000a3002') is distinct from 'confirmed' then raise exception 'Rechazar mantiene la reserva'; end if;
  -- El administrador anula directo (queda registrado como aprobado por él).
  r := public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000a3005','Reserva duplicada por error');
  if not (r->>'applied')::boolean or pg_temp.res_status('00000000-0000-4000-8000-0000000a3005') is distinct from 'cancelled' then raise exception 'Administrador anula directo'; end if;
  if (select status||'/'||(decided_by is not null)::text from public.lodging_reservation_cancellations where id=(r->>'id')::uuid) is distinct from 'approved/true' then raise exception 'Queda registrada'; end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.audit_logs where action='cancel_reservation' and entity_id in('00000000-0000-4000-8000-0000000a3001','00000000-0000-4000-8000-0000000a3005')) is distinct from 2::bigint then
    raise exception 'Auditoría de anulaciones';
  end if;
  if (select cancellation_reason from public.lodging_reservations where id='00000000-0000-4000-8000-0000000a3001') is distinct from 'El huésped canceló por teléfono' then raise exception 'Motivo en la reserva'; end if;
end $$;

select 'lodging reservation cancellations ok' as result;
rollback;
