\set ON_ERROR_STOP on
begin;

-- Verifica el cierre mensual gerencial: ingresos automáticos por pagos del mes,
-- comisiones de reservas, gastos categorizados de cierres diarios emitidos,
-- líneas manuales, utilidad calculada en PostgreSQL, plantilla de costos fijos
-- del mes anterior, cierre con foto fija, reapertura y permisos.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin_id '00000000-0000-4000-8000-0000000b0001'
\set clerk_id '00000000-0000-4000-8000-0000000b0002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'admin_id','authenticated','authenticated','monthly-admin@local.test','x',now(),now(),now()),
 (:'clerk_id','authenticated','authenticated','monthly-clerk@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='superadmin'),'Mes','Admin','monthly-admin@local.test','Pruebas',:'admin_id'),
 (:'clerk_id',(select id from public.roles where key='receptionist'),'Mes','Recepción','monthly-clerk@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'admin_id',:'company_id',:'hu_unit_id'),(:'clerk_id',:'company_id',:'hu_unit_id');

-- Aísla la prueba de datos existentes de HU (se revierte al final).
update public.lodging_reservation_payments set status='voided',voided_at=now(),voided_by=:'admin_id',void_reason='Aislamiento de prueba'
 where business_unit_id=:'hu_unit_id' and status='confirmed';
update public.lodging_reservations set status='cancelled' where business_unit_id=:'hu_unit_id' and status not in('cancelled','conflict');
delete from public.lodging_monthly_closing_lines where business_unit_id=:'hu_unit_id';
delete from public.lodging_monthly_closings where business_unit_id=:'hu_unit_id';

-- Mes de prueba: el mes anterior al actual (Santiago).
create temp table ctx as select
 (date_trunc('month',(now() at time zone 'America/Santiago'))-interval '1 month')::date as m,
 (select id from public.lodging_rooms where business_unit_id=:'hu_unit_id' order by display_order limit 1) as room;
grant select on ctx to authenticated;

-- Reserva con comisión y dos pagos (uno con reembolso) dentro del mes.
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,origin,status,check_in,check_out,total_value,commission)
select '00000000-0000-4000-8000-0000000b1001'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,room,'booking','checked_out',m+2,m+4,200000,30000 from ctx;
insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
select :'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000b1001'::uuid,'total','transfer',200000,(m+3)::timestamp at time zone 'America/Santiago'+interval '12 hours',:'admin_id'::uuid from ctx union all
select :'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000b1001'::uuid,'refund','transfer',10000,(m+5)::timestamp at time zone 'America/Santiago'+interval '12 hours',:'admin_id'::uuid from ctx;

-- Cierre diario emitido del mes con un gasto categorizado, y otro en borrador que no debe sumar.
insert into public.lodging_daily_closings(id,company_id,business_unit_id,closing_date,status,issued_at,created_by)
select '00000000-0000-4000-8000-0000000b2001'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,m+3,'issued',now(),:'admin_id'::uuid from ctx union all
select '00000000-0000-4000-8000-0000000b2002'::uuid,:'company_id'::uuid,:'hu_unit_id'::uuid,m+4,'draft',null,:'admin_id'::uuid from ctx;
insert into public.lodging_daily_closing_expenses(company_id,business_unit_id,closing_id,category_id,description,amount,payment_method,created_by)
select :'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000b2001'::uuid,
 (select id from public.lodging_finance_categories where business_unit_id=:'hu_unit_id' and name='Insumos y limpieza'),'Cloro',15000,'cash',:'admin_id'::uuid union all
select :'company_id'::uuid,:'hu_unit_id'::uuid,'00000000-0000-4000-8000-0000000b2002'::uuid,
 (select id from public.lodging_finance_categories where business_unit_id=:'hu_unit_id' and name='Insumos y limpieza'),'Borrador',99999,'cash',:'admin_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

do $$
declare
  hu uuid := (select id from public.business_units where code='HU');
  m date := (select m from ctx);
  cat_fixed uuid := (select id from public.lodging_finance_categories where business_unit_id=hu and name='Costos operativos');
  cat_staff uuid := (select id from public.lodging_finance_categories where business_unit_id=hu and name='Costos de personal');
  cat_inv uuid := (select id from public.lodging_finance_categories where business_unit_id=hu and name='Inversiones y mejoras');
  cat_income uuid := (select id from public.lodging_finance_categories where business_unit_id=hu and name='Estacionamiento');
  closing uuid; next_closing uuid; line uuid; s jsonb; failed boolean;
begin
  closing := public.lodging_monthly_start(hu,m);
  if public.lodging_monthly_start(hu,m+10)<>closing then raise exception 'Iniciar dos veces debe devolver el mismo cierre'; end if;
  perform public.lodging_monthly_save_line(closing,jsonb_build_object('category_id',cat_fixed,'description','Arriendo terreno','amount',50000,'payer','oasis'));
  perform public.lodging_monthly_save_line(closing,jsonb_build_object('category_id',cat_staff,'description','Sueldo','amount',40000,'payment_status','pendiente'));
  perform public.lodging_monthly_save_line(closing,jsonb_build_object('category_id',cat_inv,'description','Pasto','amount',20000));
  perform public.lodging_monthly_save_line(closing,jsonb_build_object('category_id',cat_income,'description','Estacionamiento','amount',5000));
  line := public.lodging_monthly_save_line(closing,jsonb_build_object('category_id',cat_fixed,'description','Duplicado','amount',1));
  perform public.lodging_monthly_delete_line(line);

  s := public.lodging_monthly_summary(hu,m);
  -- Ingresos: pagos 200.000 - 10.000 + estacionamiento 5.000.
  if (s->'totals'->>'income')::numeric<>195000 or (s->'lodging_income'->>'total')::numeric<>190000 then raise exception 'Ingresos incorrectos: %',s->'totals'; end if;
  -- Variables: comisión 30.000 + gasto diario emitido 15.000 (el borrador no suma).
  if (s->'totals'->>'variable')::numeric<>45000 or (s->'commissions'->>'amount')::numeric<>30000 then raise exception 'Variables incorrectos: %',s->'totals'; end if;
  if (s->'totals'->>'fixed')::numeric<>90000 or (s->'totals'->>'investment')::numeric<>20000 then raise exception 'Fijos/inversión incorrectos: %',s->'totals'; end if;
  if (s->'totals'->>'profit')::numeric<>40000 then raise exception 'Utilidad incorrecta: %',s->'totals'; end if;
  if (s->'pending'->>'amount')::numeric<>40000 or jsonb_array_length(s->'lines')<>4 then raise exception 'Pendientes/líneas incorrectos: %',s->'pending'; end if;
  if (select profit from public.lodging_monthly_closings where id=closing)<>40000 then raise exception 'Totales guardados incorrectos'; end if;

  perform public.lodging_monthly_close(closing,'Cierre de prueba');
  failed := false;
  begin perform public.lodging_monthly_save_line(closing,jsonb_build_object('category_id',cat_fixed,'description','Tarde','amount',1)); exception when others then failed := true; end;
  if not failed then raise exception 'Se modificó un mes cerrado'; end if;

  -- La foto no cambia aunque llegue un pago después del cierre.
  insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,registered_by)
  values((select company_id from public.business_units where id=hu),hu,'00000000-0000-4000-8000-0000000b1001','partial','cash',77777,(m+6)::timestamp at time zone 'America/Santiago'+interval '12 hours',auth.uid());
  if (public.lodging_monthly_summary(hu,m)->'totals'->>'income')::numeric<>195000 then raise exception 'La foto del mes cerrado cambió'; end if;

  -- El mes siguiente copia los costos fijos como pendientes.
  next_closing := public.lodging_monthly_start(hu,(m+interval '1 month')::date);
  if (select count(*) from public.lodging_monthly_closing_lines where closing_id=next_closing and deleted_at is null)<>2
     or exists(select 1 from public.lodging_monthly_closing_lines where closing_id=next_closing and payment_status<>'pendiente') then
    raise exception 'La plantilla de costos fijos no se copió bien'; end if;

  failed := false;
  begin perform public.lodging_monthly_reopen(closing,''); exception when others then failed := true; end;
  if not failed then raise exception 'Se reabrió sin motivo'; end if;
  perform public.lodging_monthly_reopen(closing,'Falta una factura');
  if (public.lodging_monthly_summary(hu,m)->'totals'->>'income')::numeric<>272777 then raise exception 'Al reabrir debe recalcular en vivo'; end if;

  failed := false;
  begin perform public.lodging_monthly_start(hu,(m+interval '3 months')::date); exception when others then failed := true; end;
  if not failed then raise exception 'Se preparó un mes futuro'; end if;
end $$;

-- Recepción no ve ni prepara el cierre mensual, pero sí ve categorías para sus gastos diarios.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
do $$
declare hu uuid := (select id from public.business_units where code='HU'); failed boolean := false;
begin
  if exists(select 1 from public.lodging_monthly_closings) then raise exception 'Recepción ve cierres mensuales'; end if;
  if not exists(select 1 from public.lodging_finance_categories where allow_daily) then raise exception 'Recepción debe ver categorías diarias'; end if;
  begin perform public.lodging_monthly_start(hu,(select m from ctx)); exception when others then failed := true; end;
  if not failed then raise exception 'Recepción preparó un cierre mensual'; end if;
end $$;

select 'lodging monthly closing ok' as result;
rollback;
