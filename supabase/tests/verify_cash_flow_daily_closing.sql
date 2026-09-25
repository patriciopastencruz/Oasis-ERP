\set ON_ERROR_STOP on
begin;

-- Verifica el flujo de caja: registro de ingresos/gastos por unidad, totales
-- del cierre calculados en PostgreSQL, bloqueo de un día cerrado, reapertura
-- con permiso de gestión y aislamiento entre unidades de negocio.

select id as company_id from public.companies where code='OASIS' \gset
select id as da_unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
select id as hu_unit_id from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin_id '00000000-0000-4000-8000-0000000f0001'
\set clerk_id '00000000-0000-4000-8000-0000000f0002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'admin_id','authenticated','authenticated','cashflow-admin@local.test','x',now(),now(),now()),
 (:'clerk_id','authenticated','authenticated','cashflow-clerk@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin_id',(select id from public.roles where key='superadmin'),'Caja','Admin','cashflow-admin@local.test','Pruebas',:'admin_id'),
 (:'clerk_id',(select id from public.roles where key='receptionist'),'Caja','Recepción','cashflow-clerk@local.test','Pruebas',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'clerk_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'admin_id',:'company_id',:'da_unit_id'),(:'admin_id',:'company_id',:'hu_unit_id'),
 (:'clerk_id',:'company_id',:'hu_unit_id');

set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin_id'),true);

do $$
declare
  da uuid := (select id from public.business_units where code='DA');
  hu uuid := (select id from public.business_units where code='HU');
  income_cat uuid := (select id from public.cash_flow_categories where business_unit_id=da and kind='income' and name='Ventas y servicios');
  expense_cat uuid := (select id from public.cash_flow_categories where business_unit_id=da and kind='expense' and name='Compras e insumos');
  hu_cat uuid := (select id from public.cash_flow_categories where business_unit_id=hu and kind='income' and name='Ventas y servicios');
  day date := public.cash_flow_today() - 1;
  voided uuid;
  closing public.cash_flow_daily_closings;
  failed boolean;
begin
  if income_cat is null or expense_cat is null then raise exception 'Faltan categorías base para DA'; end if;

  perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',income_cat,'entry_date',day,'description','Venta mostrador','amount',120000,'payment_method','cash'));
  perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',income_cat,'entry_date',day,'description','Venta transferencia','amount',58000,'payment_method','transfer'));
  perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',expense_cat,'entry_date',day,'description','Bolsas hielo','amount',30000,'payment_method','cash'));
  voided := public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',expense_cat,'entry_date',day,'description','Registro duplicado','amount',999999,'payment_method','cash'));
  perform public.cash_flow_void_entry(voided,'Duplicado');
  -- Movimiento de otra unidad, mismo día: no debe sumar en DA.
  perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',hu,'category_id',hu_cat,'entry_date',day,'description','Alojamiento','amount',45000,'payment_method','cash'));

  -- Una categoría de HU no puede usarse para registrar en DA.
  failed := false;
  begin
    perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',hu_cat,'entry_date',day,'description','Cruce','amount',1000));
  exception when others then failed := true; end;
  if not failed then raise exception 'Se aceptó una categoría de otra unidad'; end if;

  -- No se aceptan fechas futuras.
  failed := false;
  begin
    perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',income_cat,'entry_date',public.cash_flow_today()+1,'description','Futuro','amount',1000));
  exception when others then failed := true; end;
  if not failed then raise exception 'Se aceptó una fecha futura'; end if;

  perform public.cash_flow_close_day(da,day,jsonb_build_object('opening_cash',20000,'counted_cash',105000,'notes','Cierre de prueba','total_income',1));
  select * into closing from public.cash_flow_daily_closings where business_unit_id=da and closing_date=day;
  if closing.total_income<>178000 or closing.total_expense<>30000 or closing.net_result<>148000 then
    raise exception 'Totales incorrectos: % % %',closing.total_income,closing.total_expense,closing.net_result;
  end if;
  if closing.expected_cash<>110000 or closing.cash_difference<>-5000 or closing.entries_count<>3 then
    raise exception 'Cuadratura incorrecta: % % %',closing.expected_cash,closing.cash_difference,closing.entries_count;
  end if;

  -- Día cerrado: no se registra ni se anula.
  failed := false;
  begin
    perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',income_cat,'entry_date',day,'description','Tarde','amount',1000));
  exception when others then failed := true; end;
  if not failed then raise exception 'Se registró en un día cerrado'; end if;

  perform public.cash_flow_reopen_day(da,day,'Falta una venta');
  perform public.cash_flow_record_entry(jsonb_build_object('business_unit_id',da,'category_id',income_cat,'entry_date',day,'description','Venta olvidada','amount',2000,'payment_method','debit_card'));
  perform public.cash_flow_close_day(da,day,jsonb_build_object('opening_cash',20000));
  select * into closing from public.cash_flow_daily_closings where business_unit_id=da and closing_date=day;
  if closing.status<>'closed' or closing.total_income<>180000 or closing.counted_cash is not null or closing.cash_difference is not null then
    raise exception 'El recierre no recalculó: % % %',closing.status,closing.total_income,closing.counted_cash;
  end if;
end $$;

-- La recepcionista solo ve HU, no puede reabrir y no puede operar en DA.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk_id'),true);
do $$
declare
  da uuid := (select id from public.business_units where code='DA');
  failed boolean;
begin
  if exists(select 1 from public.cash_flow_entries where business_unit_id=da) then raise exception 'La recepcionista ve movimientos de DA'; end if;
  if (select count(*) from public.cash_flow_entries) <> 1 then raise exception 'La recepcionista debería ver solo el movimiento de HU'; end if;
  failed := false;
  begin
    perform public.cash_flow_reopen_day(da,public.cash_flow_today()-1,'Intento');
  exception when others then failed := true; end;
  if not failed then raise exception 'La recepcionista reabrió un día'; end if;
  failed := false;
  begin
    insert into public.cash_flow_entries(company_id,business_unit_id,entry_date,kind,category_id,description,amount,payment_method,created_by)
    select company_id,business_unit_id,current_date,'income',id,'Directo',1,'cash',auth.uid() from public.cash_flow_categories limit 1;
  exception when others then failed := true; end;
  if not failed then raise exception 'Se permitió insertar directo en la tabla'; end if;
end $$;

select 'cash flow daily closing ok' as result;
rollback;
