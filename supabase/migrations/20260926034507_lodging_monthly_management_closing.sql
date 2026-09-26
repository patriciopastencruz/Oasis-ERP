begin;

-- Cierre mensual gerencial por hostal (HU/HOC/HOB): estado de resultados con
-- ingresos, costos fijos, costos variables, inversión, retiros y otros gastos.
-- Se alimenta automáticamente de los pagos recibidos (venta hospedaje), las
-- comisiones de las reservas y los gastos categorizados de los cierres
-- diarios; administración agrega las líneas manuales (arriendos, sueldos...).
-- Los totales los calcula PostgreSQL y al cerrar quedan en una foto fija.

insert into public.permissions(key,module,description) values
 ('lodging.monthly_closing.view','lodging','Ver el cierre mensual gerencial y su informe'),
 ('lodging.monthly_closing.manage','lodging','Preparar, cerrar y reabrir el cierre mensual gerencial y sus categorías')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (p.key='lodging.monthly_closing.view' and r.key in('administrator','superadmin','general_manager','finance_manager'))
   or (p.key='lodging.monthly_closing.manage' and r.key in('administrator','superadmin'))
on conflict do nothing;

-- ---------- Catálogo de categorías (plan de cuentas simple por unidad) ----------
create table public.lodging_finance_categories(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 section text not null check(section in('income','fixed','variable','investment','withdrawal','other')),
 name text not null check(char_length(btrim(name)) between 2 and 80),
 allow_daily boolean not null default false,
 sort_order integer not null default 100,
 active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,name)
);
create index lodging_finance_categories_unit_idx on public.lodging_finance_categories(company_id,business_unit_id,section) where active;

create or replace function public.lodging_seed_finance_categories(target_company uuid,target_unit uuid) returns void language sql security definer set search_path='' as $$
 insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,sort_order)
 select target_company,target_unit,v.section,v.name,v.allow_daily,v.sort_order from (values
  ('income','Estacionamiento',false,20),
  ('income','Otros ingresos',false,90),
  ('fixed','Costos operativos',false,10),
  ('fixed','Costos de personal',false,20),
  ('variable','Comisiones plataformas',false,10),
  ('variable','Costo tarjetas de crédito',false,20),
  ('variable','Insumos y limpieza',true,30),
  ('variable','Gas y combustible',true,35),
  ('variable','Impuestos',false,40),
  ('variable','Reparaciones y mantenimiento',true,50),
  ('variable','Marketing y publicidad',true,60),
  ('variable','Almuerzos y alimentación',true,70),
  ('variable','Otros gastos variables',true,90),
  ('investment','Inversiones y mejoras',true,10),
  ('withdrawal','Retiros',false,10),
  ('other','Otros gastos no operacionales',false,10)
 ) as v(section,name,allow_daily,sort_order)
 on conflict(business_unit_id,name) do nothing;
$$;
revoke execute on function public.lodging_seed_finance_categories(uuid,uuid) from public,anon,authenticated;
select public.lodging_seed_finance_categories(bu.company_id,bu.id) from public.business_units bu
where bu.code in('HU','HOC','HOB') and bu.deleted_at is null;

-- Los gastos del cierre diario llevan categoría (las filas antiguas quedan sin ella).
alter table public.lodging_daily_closing_expenses add column category_id uuid references public.lodging_finance_categories(id);
create index lodging_daily_closing_expenses_category_idx on public.lodging_daily_closing_expenses(category_id);

-- ---------- Cierre mensual ----------
create table public.lodging_monthly_closings(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 period date not null check(extract(day from period)=1),
 status text not null default 'draft' check(status in('draft','closed')),
 snapshot jsonb,
 income_total numeric(14,0) not null default 0,
 fixed_total numeric(14,0) not null default 0,
 variable_total numeric(14,0) not null default 0,
 investment_total numeric(14,0) not null default 0,
 withdrawal_total numeric(14,0) not null default 0,
 other_total numeric(14,0) not null default 0,
 profit numeric(14,0) not null default 0,
 notes text check(notes is null or char_length(notes)<=2000),
 closed_at timestamptz,closed_by uuid references public.profiles(id),
 reopened_at timestamptz,reopened_by uuid references public.profiles(id),reopen_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,period),
 check(status<>'closed' or (closed_at is not null and snapshot is not null))
);
create index lodging_monthly_closings_unit_idx on public.lodging_monthly_closings(company_id,business_unit_id,period desc);

create table public.lodging_monthly_closing_lines(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 closing_id uuid not null references public.lodging_monthly_closings(id),
 category_id uuid not null references public.lodging_finance_categories(id),
 description text not null check(char_length(btrim(description)) between 2 and 160),
 amount numeric(14,0) not null check(amount>=0),
 payer text check(payer is null or char_length(payer)<=60),
 payment_status text not null default 'pagado' check(payment_status in('pagado','pendiente')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 deleted_at timestamptz,deleted_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_monthly_closing_lines_closing_idx on public.lodging_monthly_closing_lines(closing_id) where deleted_at is null;
create index lodging_monthly_closing_lines_unit_idx on public.lodging_monthly_closing_lines(company_id,business_unit_id);
create index lodging_monthly_closing_lines_category_idx on public.lodging_monthly_closing_lines(category_id);

create trigger lodging_finance_categories_updated_at before update on public.lodging_finance_categories for each row execute function public.set_updated_at();
create trigger lodging_monthly_closings_updated_at before update on public.lodging_monthly_closings for each row execute function public.set_updated_at();
create trigger lodging_monthly_closing_lines_updated_at before update on public.lodging_monthly_closing_lines for each row execute function public.set_updated_at();
create trigger audit_lodging_finance_categories after insert or update or delete on public.lodging_finance_categories for each row execute function public.audit_row_change();
create trigger audit_lodging_monthly_closings after insert or update or delete on public.lodging_monthly_closings for each row execute function public.audit_row_change();
create trigger audit_lodging_monthly_closing_lines after insert or update or delete on public.lodging_monthly_closing_lines for each row execute function public.audit_row_change();

-- ---------- Resumen del mes (sin validar al usuario; uso interno) ----------
create or replace function public.lodging_monthly_summary_internal(target_unit uuid,target_period date) returns jsonb language sql stable security definer set search_path='' as $$
 with bounds as (
  select date_trunc('month',target_period)::date as start_date,(date_trunc('month',target_period)+interval '1 month')::date as next_date
 ), closing as (
  select c.* from public.lodging_monthly_closings c,bounds b where c.business_unit_id=target_unit and c.period=b.start_date
 ), pay as (
  select p.payment_method,case when p.type='refund' then -p.amount else p.amount end as amount
  from public.lodging_reservation_payments p,bounds b
  where p.business_unit_id=target_unit and p.status='confirmed'
   and (p.paid_at at time zone 'America/Santiago')::date>=b.start_date and (p.paid_at at time zone 'America/Santiago')::date<b.next_date
 ), commissions as (
  select coalesce(sum(r.commission),0) as amount from public.lodging_reservations r,bounds b
  where r.business_unit_id=target_unit and r.status not in('cancelled','conflict') and r.origin<>'maintenance'
   and r.check_in>=b.start_date and r.check_in<b.next_date
 ), daily as (
  select e.category_id,coalesce(fc.name,'Gastos diarios sin categoría') as name,coalesce(fc.section,'variable') as section,
   sum(e.amount) as amount,count(*)::int as lines
  from public.lodging_daily_closing_expenses e
  join public.lodging_daily_closings d on d.id=e.closing_id and d.status='issued'
  left join public.lodging_finance_categories fc on fc.id=e.category_id
  cross join bounds b
  where e.business_unit_id=target_unit and e.deleted_at is null and d.closing_date>=b.start_date and d.closing_date<b.next_date
  group by 1,2,3
 ), lines as (
  select l.id,l.category_id,fc.name as category,fc.section,l.description,l.amount,l.payer,l.payment_status
  from public.lodging_monthly_closing_lines l join closing c on c.id=l.closing_id
  join public.lodging_finance_categories fc on fc.id=l.category_id
  where l.deleted_at is null
 ), commission_category as (
  select id,name from public.lodging_finance_categories where business_unit_id=target_unit and name='Comisiones plataformas' limit 1
 ), totals as (
  select
   coalesce((select sum(amount) from pay),0)+coalesce((select sum(amount) from lines where section='income'),0)+coalesce((select sum(amount) from daily where section='income'),0) as income,
   coalesce((select sum(amount) from lines where section='fixed'),0)+coalesce((select sum(amount) from daily where section='fixed'),0) as fixed,
   coalesce((select sum(amount) from lines where section='variable'),0)+coalesce((select sum(amount) from daily where section='variable'),0)+(select amount from commissions) as variable,
   coalesce((select sum(amount) from lines where section='investment'),0)+coalesce((select sum(amount) from daily where section='investment'),0) as investment,
   coalesce((select sum(amount) from lines where section='withdrawal'),0)+coalesce((select sum(amount) from daily where section='withdrawal'),0) as withdrawal,
   coalesce((select sum(amount) from lines where section='other'),0)+coalesce((select sum(amount) from daily where section='other'),0) as other
 )
 select jsonb_build_object(
  'period',(select start_date from bounds),
  'days',((select next_date from bounds)-(select start_date from bounds)),
  'lodging_income',jsonb_build_object(
   'total',coalesce((select sum(amount) from pay),0),
   'by_method',coalesce((select jsonb_object_agg(payment_method,amount) from (select payment_method,sum(amount) as amount from pay group by 1) m),'{}'::jsonb)),
  'commissions',jsonb_build_object('amount',(select amount from commissions),'category_id',(select id from commission_category)),
  'daily_expenses',coalesce((select jsonb_agg(jsonb_build_object('category_id',category_id,'name',name,'section',section,'amount',amount,'lines',lines) order by amount desc) from daily),'[]'::jsonb),
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'category',category,'section',section,'description',description,'amount',amount,'payer',payer,'payment_status',payment_status) order by section,category,description) from lines),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'section',section,'name',name,'sort_order',sort_order,'active',active) order by sort_order,name)
   from public.lodging_finance_categories where business_unit_id=target_unit),'[]'::jsonb),
  'totals',jsonb_build_object('income',t.income,'fixed',t.fixed,'variable',t.variable,'investment',t.investment,'withdrawal',t.withdrawal,'other',t.other,
   'costs',t.fixed+t.variable,'profit',t.income-t.fixed-t.variable-t.investment-t.withdrawal-t.other),
  'pending',jsonb_build_object('count',(select count(*) from lines where payment_status='pendiente'),'amount',coalesce((select sum(amount) from lines where payment_status='pendiente'),0)),
  'daily_closings',jsonb_build_object(
   'issued',(select count(*) from public.lodging_daily_closings d,bounds b where d.business_unit_id=target_unit and d.status='issued' and d.closing_date>=b.start_date and d.closing_date<b.next_date))
 ) from totals t
$$;
revoke execute on function public.lodging_monthly_summary_internal(uuid,date) from public,anon,authenticated;

create or replace function public.lodging_monthly_assert_unit(target_unit uuid) returns public.business_units language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 return unit;
end $$;
revoke execute on function public.lodging_monthly_assert_unit(uuid) from public,anon,authenticated;

-- Resumen visible: si el mes está cerrado devuelve la foto guardada.
create or replace function public.lodging_monthly_summary(target_unit uuid,target_period date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units; c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.view') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_monthly_assert_unit(target_unit);
 select * into c from public.lodging_monthly_closings where business_unit_id=unit.id and period=date_trunc('month',target_period)::date;
 if c.id is not null and c.status='closed' then return c.snapshot; end if;
 return public.lodging_monthly_summary_internal(unit.id,target_period);
end $$;

create or replace function public.lodging_monthly_refresh_totals(target_closing uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_monthly_closings; s jsonb;
begin
 select * into strict c from public.lodging_monthly_closings where id=target_closing;
 s:=public.lodging_monthly_summary_internal(c.business_unit_id,c.period);
 update public.lodging_monthly_closings set
  income_total=(s->'totals'->>'income')::numeric,fixed_total=(s->'totals'->>'fixed')::numeric,
  variable_total=(s->'totals'->>'variable')::numeric,investment_total=(s->'totals'->>'investment')::numeric,
  withdrawal_total=(s->'totals'->>'withdrawal')::numeric,other_total=(s->'totals'->>'other')::numeric,
  profit=(s->'totals'->>'profit')::numeric
 where id=c.id;
end $$;
revoke execute on function public.lodging_monthly_refresh_totals(uuid) from public,anon,authenticated;

-- Crea el borrador del mes y copia los costos fijos del último mes como plantilla (pendientes de pago).
create or replace function public.lodging_monthly_start(target_unit uuid,target_period date) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; p date:=date_trunc('month',target_period)::date; new_closing uuid; source_id uuid;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_monthly_assert_unit(target_unit);
 if p>date_trunc('month',(now() at time zone 'America/Santiago'))::date then raise exception 'No se puede preparar un mes futuro'; end if;
 select id into new_closing from public.lodging_monthly_closings where business_unit_id=unit.id and period=p;
 if new_closing is not null then return new_closing; end if;
 insert into public.lodging_monthly_closings(company_id,business_unit_id,period,created_by) values(unit.company_id,unit.id,p,me) returning id into new_closing;
 select id into source_id from public.lodging_monthly_closings where business_unit_id=unit.id and period<p order by period desc limit 1;
 if source_id is not null then
  insert into public.lodging_monthly_closing_lines(company_id,business_unit_id,closing_id,category_id,description,amount,payer,payment_status,created_by)
  select l.company_id,l.business_unit_id,new_closing,l.category_id,l.description,l.amount,l.payer,'pendiente',me
  from public.lodging_monthly_closing_lines l join public.lodging_finance_categories fc on fc.id=l.category_id
  where l.closing_id=source_id and l.deleted_at is null and fc.section='fixed' and fc.active;
 end if;
 perform public.lodging_monthly_refresh_totals(new_closing);
 return new_closing;
end $$;

-- payload: id (opcional para editar), category_id, description, amount, payer, payment_status.
create or replace function public.lodging_monthly_save_line(target_closing uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); c public.lodging_monthly_closings; cat public.lodging_finance_categories; line_id uuid; amt numeric; st text;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_monthly_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status<>'draft' then raise exception 'El mes ya esta cerrado'; end if;
 select * into cat from public.lodging_finance_categories where id=nullif(payload->>'category_id','')::uuid;
 if cat.id is null or cat.business_unit_id<>c.business_unit_id or not cat.active then raise exception 'Categoria invalida'; end if;
 if char_length(coalesce(btrim(payload->>'description'),''))<2 then raise exception 'La descripcion es obligatoria'; end if;
 amt:=round(nullif(payload->>'amount','')::numeric);
 if amt is null or amt<0 then raise exception 'Monto invalido'; end if;
 st:=coalesce(nullif(payload->>'payment_status',''),'pagado');
 if st not in('pagado','pendiente') then raise exception 'Estado de pago invalido'; end if;
 line_id:=nullif(payload->>'id','')::uuid;
 if line_id is not null then
  update public.lodging_monthly_closing_lines set category_id=cat.id,description=btrim(payload->>'description'),amount=amt,
   payer=nullif(btrim(payload->>'payer'),''),payment_status=st,updated_by=me
  where id=line_id and closing_id=c.id and deleted_at is null;
  if not found then raise exception 'Linea no encontrada'; end if;
 else
  insert into public.lodging_monthly_closing_lines(company_id,business_unit_id,closing_id,category_id,description,amount,payer,payment_status,created_by)
  values(c.company_id,c.business_unit_id,c.id,cat.id,btrim(payload->>'description'),amt,nullif(btrim(payload->>'payer'),''),st,me)
  returning id into line_id;
 end if;
 perform public.lodging_monthly_refresh_totals(c.id);
 return line_id;
end $$;

create or replace function public.lodging_monthly_delete_line(target_line uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.lodging_monthly_closing_lines; c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into l from public.lodging_monthly_closing_lines where id=target_line and deleted_at is null for update;
 if l.id is null or not public.can_access_unit(l.company_id,l.business_unit_id) then raise exception 'Linea no encontrada'; end if;
 select * into c from public.lodging_monthly_closings where id=l.closing_id;
 if c.status<>'draft' then raise exception 'El mes ya esta cerrado'; end if;
 update public.lodging_monthly_closing_lines set deleted_at=now(),deleted_by=auth.uid() where id=l.id;
 perform public.lodging_monthly_refresh_totals(c.id);
end $$;

create or replace function public.lodging_monthly_toggle_line_status(target_line uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.lodging_monthly_closing_lines; c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into l from public.lodging_monthly_closing_lines where id=target_line and deleted_at is null for update;
 if l.id is null or not public.can_access_unit(l.company_id,l.business_unit_id) then raise exception 'Linea no encontrada'; end if;
 select * into c from public.lodging_monthly_closings where id=l.closing_id;
 if c.status<>'draft' then raise exception 'El mes ya esta cerrado'; end if;
 update public.lodging_monthly_closing_lines set payment_status=case when payment_status='pagado' then 'pendiente' else 'pagado' end,updated_by=auth.uid() where id=l.id;
end $$;

create or replace function public.lodging_monthly_close(target_closing uuid,closing_notes text) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_monthly_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status<>'draft' then raise exception 'El mes ya esta cerrado'; end if;
 perform public.lodging_monthly_refresh_totals(c.id);
 update public.lodging_monthly_closings set status='closed',snapshot=public.lodging_monthly_summary_internal(c.business_unit_id,c.period),
  notes=nullif(btrim(closing_notes),''),closed_at=now(),closed_by=auth.uid(),updated_by=auth.uid()
 where id=c.id;
end $$;

create or replace function public.lodging_monthly_reopen(target_closing uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_monthly_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status<>'closed' then raise exception 'El mes no esta cerrado'; end if;
 if char_length(coalesce(btrim(reason),''))<3 then raise exception 'Indica el motivo de la reapertura'; end if;
 update public.lodging_monthly_closings set status='draft',reopened_at=now(),reopened_by=auth.uid(),reopen_reason=btrim(reason),updated_by=auth.uid() where id=c.id;
end $$;

create or replace function public.lodging_finance_category_create(target_unit uuid,target_section text,category_name text,daily boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare unit public.business_units; cat_id uuid;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_monthly_assert_unit(target_unit);
 if target_section not in('income','fixed','variable','investment','withdrawal','other') then raise exception 'Seccion invalida'; end if;
 if char_length(coalesce(btrim(category_name),''))<2 then raise exception 'El nombre de la categoria es obligatorio'; end if;
 if exists(select 1 from public.lodging_finance_categories where business_unit_id=unit.id and lower(name)=lower(btrim(category_name))) then raise exception 'La categoria ya existe'; end if;
 insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,created_by)
 values(unit.company_id,unit.id,target_section,btrim(category_name),coalesce(daily,false) and target_section<>'income',auth.uid()) returning id into cat_id;
 return cat_id;
end $$;

create or replace function public.lodging_finance_category_toggle(target_category uuid,is_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare cat public.lodging_finance_categories;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into cat from public.lodging_finance_categories where id=target_category for update;
 if cat.id is null or not public.can_access_unit(cat.company_id,cat.business_unit_id) then raise exception 'Categoria no encontrada'; end if;
 update public.lodging_finance_categories set active=is_active,updated_by=auth.uid() where id=cat.id;
end $$;

-- ---------- Cierre diario: cada gasto exige una categoría habilitada para gastos diarios ----------
create or replace function public.lodging_save_daily_closing(target_unit uuid,target_date date,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; c public.lodging_daily_closings; saved_id uuid;
 today date:=(now() at time zone 'America/Santiago')::date; line jsonb; line_amount numeric; line_method text; line_category uuid;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if target_date is null or target_date>today then raise exception 'No se puede cerrar una fecha futura'; end if;
 if target_date<today-1 and not public.has_permission('lodging.closings.manage') then raise exception 'Solo puedes cerrar el dia de hoy o el dia anterior'; end if;
 if jsonb_typeof(coalesce(payload->'expenses','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(payload->'expenses','[]'::jsonb))>50 then raise exception 'Gastos invalidos'; end if;
 select * into c from public.lodging_daily_closings where business_unit_id=unit.id and closing_date=target_date for update;
 if c.id is not null and c.status='issued' and not public.has_permission('lodging.closings.manage') then raise exception 'El cierre ya fue emitido'; end if;

 insert into public.lodging_daily_closings as d(company_id,business_unit_id,closing_date,status,reported_problems,items_to_replenish,observations,created_by)
 values(unit.company_id,unit.id,target_date,'draft',nullif(btrim(payload->>'reported_problems'),''),nullif(btrim(payload->>'items_to_replenish'),''),nullif(btrim(payload->>'observations'),''),me)
 on conflict(business_unit_id,closing_date) do update set status='draft',reported_problems=excluded.reported_problems,
  items_to_replenish=excluded.items_to_replenish,observations=excluded.observations,updated_by=me
 returning d.id into saved_id;

 update public.lodging_daily_closing_expenses set deleted_at=now(),deleted_by=me where closing_id=saved_id and deleted_at is null;
 for line in select * from jsonb_array_elements(coalesce(payload->'expenses','[]'::jsonb)) loop
  line_amount:=round(nullif(line->>'amount','')::numeric);
  line_method:=coalesce(nullif(line->>'payment_method',''),'cash');
  line_category:=nullif(line->>'category_id','')::uuid;
  if char_length(coalesce(btrim(line->>'description'),''))<2 then raise exception 'Cada gasto requiere descripcion'; end if;
  if line_amount is null or line_amount<=0 then raise exception 'El monto de cada gasto debe ser mayor a cero'; end if;
  if line_method not in('cash','transfer','card','other') then raise exception 'Medio de pago invalido'; end if;
  if line_category is null or not exists(select 1 from public.lodging_finance_categories fc where fc.id=line_category
     and fc.business_unit_id=unit.id and fc.active and fc.allow_daily) then raise exception 'Cada gasto requiere una categoria valida'; end if;
  insert into public.lodging_daily_closing_expenses(company_id,business_unit_id,closing_id,category_id,description,amount,payment_method,created_by)
  values(unit.company_id,unit.id,saved_id,line_category,btrim(line->>'description'),line_amount,line_method,me);
 end loop;

 perform public.lodging_apply_closing_snapshot(saved_id);
 return saved_id;
end $$;

-- ---------- RLS y privilegios ----------
alter table public.lodging_finance_categories enable row level security;
alter table public.lodging_monthly_closings enable row level security;
alter table public.lodging_monthly_closing_lines enable row level security;
create policy lodging_finance_categories_select on public.lodging_finance_categories for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (public.has_permission('lodging.monthly_closing.view') or public.has_permission('lodging.closings.create')));
create policy lodging_monthly_closings_select on public.lodging_monthly_closings for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.monthly_closing.view'));
create policy lodging_monthly_closing_lines_select on public.lodging_monthly_closing_lines for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.monthly_closing.view'));

revoke all on public.lodging_finance_categories,public.lodging_monthly_closings,public.lodging_monthly_closing_lines from public,anon,authenticated;
grant select on public.lodging_finance_categories,public.lodging_monthly_closings,public.lodging_monthly_closing_lines to authenticated;

revoke execute on function public.lodging_monthly_summary(uuid,date),public.lodging_monthly_start(uuid,date),public.lodging_monthly_save_line(uuid,jsonb),
 public.lodging_monthly_delete_line(uuid),public.lodging_monthly_toggle_line_status(uuid),public.lodging_monthly_close(uuid,text),
 public.lodging_monthly_reopen(uuid,text),public.lodging_finance_category_create(uuid,text,text,boolean),public.lodging_finance_category_toggle(uuid,boolean) from public,anon;
grant execute on function public.lodging_monthly_summary(uuid,date),public.lodging_monthly_start(uuid,date),public.lodging_monthly_save_line(uuid,jsonb),
 public.lodging_monthly_delete_line(uuid),public.lodging_monthly_toggle_line_status(uuid),public.lodging_monthly_close(uuid,text),
 public.lodging_monthly_reopen(uuid,text),public.lodging_finance_category_create(uuid,text,text,boolean),public.lodging_finance_category_toggle(uuid,boolean) to authenticated;

commit;
