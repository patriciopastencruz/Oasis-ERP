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
 ('00000000-0000-4000-8000-0000000e2006',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e1002','direct','cancelled',current_date+3,current_date+4,100,0,0,100,false);
insert into public.lodging_reservation_payments(id,company_id,business_unit_id,reservation_id,type,payment_method,amount,status,registered_by)
values
 ('00000000-0000-4000-8000-0000000e3001',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2001','total','transfer',100,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3003',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2003','total','transfer',100,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3004',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2004','deposit','transfer',50,'confirmed',:'clerk_id'),
 ('00000000-0000-4000-8000-0000000e3006',:'company_id',:'hu_unit_id','00000000-0000-4000-8000-0000000e2006','deposit','transfer',40,'confirmed',:'clerk_id');

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
  if (s->'reconciliation'->'cancelled_payments'->>'count')::int <> 0 then
    raise exception 'Los pagos retenidos no deben quedar como pendientes: %', s->'reconciliation';
  end if;
  if not exists(select 1 from public.audit_logs where entity_id='00000000-0000-4000-8000-0000000e2004' and action='cancelled_payments_retain') then
    raise exception 'Falta la auditoría de la decisión sobre los pagos';
  end if;
end $$;

rollback;
