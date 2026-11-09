\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set clerk_id '00000000-0000-4000-8000-0000000e0001'
\set admin_id '00000000-0000-4000-8000-0000000e0002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'clerk_id','authenticated','authenticated','cancelpay-clerk@local.test','x',now(),now(),now()),
      (:'admin_id','authenticated','authenticated','cancelpay-admin@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'clerk_id',(select id from public.roles where key='receptionist'),'Pagos','Recepción','cancelpay-clerk@local.test','Pruebas',:'clerk_id'),
      (:'admin_id',(select id from public.roles where key='superadmin'),'Pagos','Admin','cancelpay-admin@local.test','Pruebas',:'clerk_id');
insert into public.user_companies(user_id,company_id) values(:'clerk_id',:'company_id'),(:'admin_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id)
values(:'clerk_id',:'company_id',:'hu_unit_id'),(:'admin_id',:'company_id',:'hu_unit_id');

insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,capacity,base_rate)
values('00000000-0000-4000-8000-0000000e1001',:'company_id',:'hu_unit_id','CPAY-1','Pagos 1',2,100),
      ('00000000-0000-4000-8000-0000000e1002',:'company_id',:'hu_unit_id','CPAY-2','Pagos 2',2,100);

-- A: se anula y su pago pasa a B. C: recepción pide anular pagos (requiere aprobación). D: se retiene.
-- E: sin pagos. F: ya anulada con un pago pendiente de resolver.
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,nightly_rate,discount,surcharge,total_value,imported_from_ical)
values
 ('00000000-0000-4000-8000-0000000e2001',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1001','direct','confirmed',current_date+1,current_date+2,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2002',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1002','direct','confirmed',current_date+1,current_date+2,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2003',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1001','direct','confirmed',current_date+3,current_date+4,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2004',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1001','direct','confirmed',current_date+5,current_date+6,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2005',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1001','direct','confirmed',current_date+7,current_date+8,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2006',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1002','direct','cancelled',current_date+3,current_date+4,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2007',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1002','direct','confirmed',current_date+9,current_date+10,100,0,0,100,false),
 ('00000000-0000-4000-8000-0000000e2008',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1002','direct','confirmed',current_date-3,current_date-2,100,0,0,100,false);
-- Un pago en una reserva ya anulada solo se puede cargar por los procesos internos.
select set_config('lodging.settling_payments','1',true);
insert into public.lodging_reservation_payments(id,company_id,business_unit_id,reservation_id,type,payment_method,amount,status,registered_by)
values
 ('00000000-0000-4000-8000-0000000e3001',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2001','total','transfer',100,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3003',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2003','total','transfer',100,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3004',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2004','deposit','transfer',50,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3006',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2006','deposit','transfer',40,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3007',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2007','total','cash',70,'confirmed',:'clerk_id');
select set_config('lodging.settling_payments','',true);

-- Control al registrar pagos.
do $$
declare failed boolean;
begin
  failed := false;
  begin
    insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at)
    select company_id,business_unit_id,id,'partial','cash',10,now()+interval '2 days' from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2007';
  exception when others then failed := sqlerrm like 'La fecha del pago no puede ser futura%'; end;
  if not failed then raise exception 'Se aceptó un pago con fecha futura'; end if;

  failed := false;
  begin
    insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount)
    select company_id,business_unit_id,id,'partial','cash',10 from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2006';
  exception when others then failed := sqlerrm like 'La reserva esta anulada%'; end;
  if not failed then raise exception 'Se aceptó un pago nuevo en una reserva anulada'; end if;

  failed := false;
  begin
    insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount)
    select r.company_id,(select id from public.business_units where code='HOC'),r.id,'partial','cash',10 from public.lodging_reservations r where r.id='00000000-0000-4000-8000-0000000e2007';
  exception when others then failed := sqlerrm like 'El pago debe ser del mismo hostal%'; end;
  if not failed then raise exception 'Se aceptó un pago de otro hostal'; end if;

  insert into public.lodging_daily_closings(company_id,business_unit_id,closing_date,status,issued_at,created_by)
  select company_id,business_unit_id,current_date-2,'issued',now(),'00000000-0000-4000-8000-0000000e0001' from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2007';
  failed := false;
  begin
    insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at)
    select company_id,business_unit_id,id,'partial','cash',10,((current_date-2)::timestamp+interval '12 hours') at time zone 'America/Santiago'
    from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2007';
  exception when others then failed := sqlerrm like 'El cierre de ese dia ya fue emitido%'; end;
  if not failed then raise exception 'Se aceptó un pago con fecha de un cierre ya emitido'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);

do $$
declare failed boolean := false; res jsonb;
begin
  -- Con pagos hay que decidir qué pasa con ellos.
  begin
    perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2001','El huésped canceló');
  exception when others then
    failed := sqlerrm like 'Indica que hacer con los pagos%';
  end;
  if not failed then raise exception 'Se anuló una reserva con pagos sin decidir qué hacer con ellos'; end if;

  -- Trasladar a otra reserva: inmediato para recepción.
  res := public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2001','Mal registro, se recreó','move','00000000-0000-4000-8000-0000000e2002');
  if not (res->>'applied')::boolean then raise exception 'El traslado debía aplicarse de inmediato'; end if;
  if (select reservation_id from public.lodging_reservation_payments where id='00000000-0000-4000-8000-0000000e3001')<>'00000000-0000-4000-8000-0000000e2002' then
    raise exception 'El pago no se trasladó';
  end if;

  -- Anular pagos lo decide el administrador: queda pendiente y el pago sigue confirmado.
  res := public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2003','Pago repetido','void');
  if (res->>'applied')::boolean then raise exception 'Recepción no puede anular pagos sin aprobación'; end if;
  if (select status from public.lodging_reservation_payments where id='00000000-0000-4000-8000-0000000e3003')<>'confirmed' then
    raise exception 'El pago se anuló antes de la aprobación';
  end if;

  -- Sin pagos no hay que decidir nada.
  res := public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2005','El huésped canceló');
  if not (res->>'applied')::boolean then raise exception 'La reserva sin pagos debía anularse'; end if;

  -- Anulación pendiente (reserva pasada, sin pagos) que después recibe un pago.
  res := public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2008','Se registró mal la estadía');
  if (res->>'applied')::boolean then raise exception 'Una reserva pasada requiere aprobación'; end if;

  -- Recepción no puede anular pagos de una reserva ya anulada, pero sí retenerlos.
  failed := false;
  begin
    perform public.lodging_cancelled_payments_settle('00000000-0000-4000-8000-0000000e2006','void',null,'repetido');
  exception when others then
    failed := sqlerrm like 'Sin autorizacion%';
  end;
  if not failed then raise exception 'Recepción anuló pagos sin permiso'; end if;
  perform public.lodging_cancelled_payments_settle('00000000-0000-4000-8000-0000000e2006','retain',null,'Abono retenido por cancelación');
  if not (select payments_retained from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2006') then
    raise exception 'El abono no quedó retenido';
  end if;
end $$;

select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,registered_by)
select company_id,business_unit_id,id,'total','transfer',30,:'admin_id' from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2008';

do $$
declare failed boolean := false; req uuid;
begin
  -- Si entretanto llegó un pago, quien aprueba decide qué hacer con él.
  req := (select id from public.lodging_reservation_cancellations where reservation_id='00000000-0000-4000-8000-0000000e2008' and status='pending');
  begin
    perform public.lodging_reservation_cancel_decide(req, true, null);
  exception when others then failed := sqlerrm like 'Indica que hacer con los pagos%'; end;
  if not failed then raise exception 'Se aprobó sin decidir qué hacer con un pago llegado después'; end if;
  perform public.lodging_reservation_cancel_decide(req, true, null, 'void');
  if exists(select 1 from public.lodging_reservation_payments where reservation_id='00000000-0000-4000-8000-0000000e2008' and status='confirmed') then
    raise exception 'Al aprobar con anular, el pago debía quedar anulado';
  end if;

  -- Devolver registra la devolución hoy y conserva el cobro original.
  perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2007','El huésped canceló y se le devolvió','refund');
  if (select status from public.lodging_reservation_payments where id='00000000-0000-4000-8000-0000000e3007')<>'confirmed'
     or not exists(select 1 from public.lodging_reservation_payments where reservation_id='00000000-0000-4000-8000-0000000e2007'
       and type='refund' and payment_method='cash' and amount=70 and status='confirmed')
     or (select sum(case when type='refund' then -amount else amount end) from public.lodging_reservation_payments
         where reservation_id='00000000-0000-4000-8000-0000000e2007' and status='confirmed')<>0
     or not (select payments_retained from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2007') then
    raise exception 'La devolución no quedó registrada como movimiento';
  end if;
end $$;

do $$
begin
  -- Al aprobar, se anulan los pagos.
  perform public.lodging_reservation_cancel_decide(
    (select id from public.lodging_reservation_cancellations where reservation_id='00000000-0000-4000-8000-0000000e2003' and status='pending'), true, null);
  if (select status from public.lodging_reservation_payments where id='00000000-0000-4000-8000-0000000e3003')<>'voided' then
    raise exception 'Al aprobar no se anuló el pago';
  end if;

  -- El administrador anula reteniendo el abono: sigue contando como pago del mes.
  perform public.lodging_reservation_cancel_request('00000000-0000-4000-8000-0000000e2004','No llegó, se retiene el abono','retain');
end $$;

reset role;
do $$
declare s jsonb;
begin
  s := public.lodging_monthly_summary_internal(
    (select business_unit_id from public.lodging_reservations where id='00000000-0000-4000-8000-0000000e2004'), current_date);
  -- Retenidos: 50 (e2004) + 40 (e2006); devuelto: 70 - 70 = 0.
  if (s->'retained'->>'total')::numeric <> 90 then
    raise exception 'Los pagos retenidos deben sumar al ingreso del mes: %', s->'retained';
  end if;
  if (s->'reconciliation'->'cancelled_payments'->>'count')::int <> 0 then
    raise exception 'Los pagos retenidos no deben quedar como pendientes: %', s->'reconciliation';
  end if;
  if not exists(select 1 from public.audit_logs where entity_id='00000000-0000-4000-8000-0000000e2004' and action='cancelled_payments_retain') then
    raise exception 'Falta la auditoría de la decisión sobre los pagos';
  end if;
end $$;

rollback;
