begin;

-- Flujo de caja por unidad de negocio: cada unidad registra a diario sus
-- ingresos y gastos, cierra el día (los totales los calcula PostgreSQL, nunca
-- el navegador) y consulta una caja mensual con ingresos, gastos y utilidad.
-- Los movimientos no se eliminan: se anulan con motivo. Un día cerrado queda
-- bloqueado para registrar o anular hasta que alguien con permiso lo reabra.

insert into public.permissions(key,module,description) values
 ('finance.cash_flow.view','finance','Ver el flujo de caja diario y mensual de la unidad'),
 ('finance.cash_flow.record','finance','Registrar y anular ingresos y gastos, y cerrar el día'),
 ('finance.cash_flow.manage','finance','Reabrir días cerrados y administrar categorías de flujo de caja')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key in('finance.cash_flow.view','finance.cash_flow.record')
 and r.key in('superadmin','general_manager','area_manager','finance_manager','administrator','operations_manager','administrative','receptionist')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='finance.cash_flow.manage'
 and r.key in('superadmin','general_manager','finance_manager')
on conflict do nothing;

create table public.cash_flow_categories(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 kind text not null check(kind in('income','expense')),
 name text not null check(char_length(btrim(name)) between 2 and 80),
 sort_order integer not null default 100,
 active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,kind,name)
);
create index cash_flow_categories_unit_idx on public.cash_flow_categories(company_id,business_unit_id,kind) where active;

create table public.cash_flow_entries(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 entry_date date not null,
 kind text not null check(kind in('income','expense')),
 category_id uuid not null references public.cash_flow_categories(id),
 description text not null check(char_length(btrim(description)) between 2 and 300),
 amount numeric(14,0) not null check(amount>0),
 payment_method text not null check(payment_method in('cash','transfer','debit_card','credit_card','check','other')),
 reference text check(reference is null or char_length(reference)<=120),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 voided_at timestamptz,voided_by uuid references public.profiles(id),
 void_reason text,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check((voided_at is null)=(void_reason is null))
);
create index cash_flow_entries_unit_date_idx on public.cash_flow_entries(company_id,business_unit_id,entry_date) where voided_at is null;
create index cash_flow_entries_category_idx on public.cash_flow_entries(category_id);

create table public.cash_flow_daily_closings(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 closing_date date not null,
 status text not null default 'closed' check(status in('closed','reopened')),
 total_income numeric(14,0) not null default 0,
 total_expense numeric(14,0) not null default 0,
 net_result numeric(14,0) not null default 0,
 cash_income numeric(14,0) not null default 0,
 cash_expense numeric(14,0) not null default 0,
 opening_cash numeric(14,0) not null default 0 check(opening_cash>=0),
 expected_cash numeric(14,0) not null default 0,
 counted_cash numeric(14,0) check(counted_cash is null or counted_cash>=0),
 cash_difference numeric(14,0),
 entries_count integer not null default 0,
 notes text,
 closed_at timestamptz not null default now(),closed_by uuid not null references public.profiles(id),
 reopened_at timestamptz,reopened_by uuid references public.profiles(id),reopen_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,closing_date)
);
create index cash_flow_daily_closings_unit_date_idx on public.cash_flow_daily_closings(company_id,business_unit_id,closing_date);

create trigger cash_flow_categories_updated_at before update on public.cash_flow_categories for each row execute function public.set_updated_at();
create trigger cash_flow_entries_updated_at before update on public.cash_flow_entries for each row execute function public.set_updated_at();
create trigger cash_flow_daily_closings_updated_at before update on public.cash_flow_daily_closings for each row execute function public.set_updated_at();
create trigger audit_cash_flow_categories after insert or update or delete on public.cash_flow_categories for each row execute function public.audit_row_change();
create trigger audit_cash_flow_entries after insert or update or delete on public.cash_flow_entries for each row execute function public.audit_row_change();
create trigger audit_cash_flow_daily_closings after insert or update or delete on public.cash_flow_daily_closings for each row execute function public.audit_row_change();

-- Categorías base para toda unidad, existente o futura.
create or replace function public.cash_flow_seed_unit_categories(target_company uuid,target_unit uuid) returns void language sql security definer set search_path='' as $$
 insert into public.cash_flow_categories(company_id,business_unit_id,kind,name,sort_order)
 select target_company,target_unit,v.kind,v.name,v.sort_order from (values
  ('income','Ventas y servicios',10),
  ('income','Cobranza de clientes',20),
  ('income','Aporte de socios',30),
  ('income','Otros ingresos',90),
  ('expense','Compras e insumos',10),
  ('expense','Remuneraciones',20),
  ('expense','Combustible y transporte',30),
  ('expense','Servicios básicos',40),
  ('expense','Arriendo',50),
  ('expense','Mantención y reparaciones',60),
  ('expense','Impuestos y patentes',70),
  ('expense','Otros gastos',90)
 ) as v(kind,name,sort_order)
 on conflict(business_unit_id,kind,name) do nothing;
$$;
revoke execute on function public.cash_flow_seed_unit_categories(uuid,uuid) from public,anon,authenticated;

create or replace function public.cash_flow_seed_new_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.cash_flow_seed_unit_categories(new.company_id,new.id);
 return new;
end $$;
create trigger cash_flow_seed_business_unit after insert on public.business_units for each row execute function public.cash_flow_seed_new_unit();

select public.cash_flow_seed_unit_categories(bu.company_id,bu.id) from public.business_units bu where bu.deleted_at is null;

create or replace function public.cash_flow_today() returns date language sql stable set search_path='' as $$
 select (now() at time zone 'America/Santiago')::date
$$;

create or replace function public.cash_flow_day_is_closed(target_unit uuid,target_date date) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cash_flow_daily_closings c where c.business_unit_id=target_unit and c.closing_date=target_date and c.status='closed')
$$;

create or replace function public.cash_flow_record_entry(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; cat public.cash_flow_categories; target_date date; entry_amount numeric; method text; entry_id uuid:=gen_random_uuid();
begin
 if not public.has_permission('finance.cash_flow.record') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=nullif(payload->>'business_unit_id','')::uuid and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad de negocio no autorizada'; end if;
 select * into cat from public.cash_flow_categories where id=nullif(payload->>'category_id','')::uuid;
 if cat.id is null or cat.business_unit_id<>unit.id or not cat.active then raise exception 'Categoria invalida'; end if;
 target_date:=nullif(payload->>'entry_date','')::date;
 if target_date is null then raise exception 'La fecha es obligatoria'; end if;
 if target_date>public.cash_flow_today() then raise exception 'No se pueden registrar movimientos en fechas futuras'; end if;
 if public.cash_flow_day_is_closed(unit.id,target_date) then raise exception 'El dia ya esta cerrado'; end if;
 if nullif(btrim(payload->>'description'),'') is null or char_length(btrim(payload->>'description'))<2 then raise exception 'La descripcion es obligatoria'; end if;
 entry_amount:=round(nullif(payload->>'amount','')::numeric);
 if entry_amount is null or entry_amount<=0 then raise exception 'El monto debe ser mayor a cero'; end if;
 method:=coalesce(nullif(payload->>'payment_method',''),'cash');
 if method not in('cash','transfer','debit_card','credit_card','check','other') then raise exception 'Medio de pago invalido'; end if;
 insert into public.cash_flow_entries(id,company_id,business_unit_id,entry_date,kind,category_id,description,amount,payment_method,reference,created_by)
 values(entry_id,unit.company_id,unit.id,target_date,cat.kind,cat.id,btrim(payload->>'description'),entry_amount,method,nullif(btrim(payload->>'reference'),''),me);
 return entry_id;
end $$;

create or replace function public.cash_flow_void_entry(target_entry uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare e public.cash_flow_entries;
begin
 if not public.has_permission('finance.cash_flow.record') then raise exception 'Sin autorizacion'; end if;
 select * into e from public.cash_flow_entries where id=target_entry for update;
 if e.id is null or not public.can_access_unit(e.company_id,e.business_unit_id) then raise exception 'Movimiento no encontrado'; end if;
 if e.voided_at is not null then raise exception 'El movimiento ya esta anulado'; end if;
 if public.cash_flow_day_is_closed(e.business_unit_id,e.entry_date) then raise exception 'El dia ya esta cerrado'; end if;
 if nullif(btrim(reason),'') is null then raise exception 'Indica el motivo de la anulacion'; end if;
 update public.cash_flow_entries set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(reason),updated_by=auth.uid() where id=e.id;
end $$;

-- Cierra el día calculando los totales desde los movimientos vigentes.
-- payload: opening_cash, counted_cash (opcional), notes.
create or replace function public.cash_flow_close_day(target_unit uuid,target_date date,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; t record; opening numeric; counted numeric; expected numeric; closing_id uuid;
begin
 if not public.has_permission('finance.cash_flow.record') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad de negocio no autorizada'; end if;
 if target_date is null or target_date>public.cash_flow_today() then raise exception 'No se puede cerrar una fecha futura'; end if;
 if public.cash_flow_day_is_closed(unit.id,target_date) then raise exception 'El dia ya esta cerrado'; end if;
 opening:=round(coalesce(nullif(payload->>'opening_cash','')::numeric,0));
 counted:=round(nullif(payload->>'counted_cash','')::numeric);
 if opening<0 or counted<0 then raise exception 'Los montos de caja no pueden ser negativos'; end if;
 select
  coalesce(sum(amount) filter(where kind='income'),0) as income,
  coalesce(sum(amount) filter(where kind='expense'),0) as expense,
  coalesce(sum(amount) filter(where kind='income' and payment_method='cash'),0) as cash_in,
  coalesce(sum(amount) filter(where kind='expense' and payment_method='cash'),0) as cash_out,
  count(*)::int as n
 into t from public.cash_flow_entries
 where business_unit_id=unit.id and entry_date=target_date and voided_at is null;
 expected:=opening+t.cash_in-t.cash_out;
 insert into public.cash_flow_daily_closings as c(company_id,business_unit_id,closing_date,status,total_income,total_expense,net_result,cash_income,cash_expense,opening_cash,expected_cash,counted_cash,cash_difference,entries_count,notes,closed_at,closed_by)
 values(unit.company_id,unit.id,target_date,'closed',t.income,t.expense,t.income-t.expense,t.cash_in,t.cash_out,opening,expected,counted,counted-expected,t.n,nullif(btrim(payload->>'notes'),''),now(),me)
 on conflict(business_unit_id,closing_date) do update set status='closed',total_income=excluded.total_income,total_expense=excluded.total_expense,
  net_result=excluded.net_result,cash_income=excluded.cash_income,cash_expense=excluded.cash_expense,opening_cash=excluded.opening_cash,
  expected_cash=excluded.expected_cash,counted_cash=excluded.counted_cash,cash_difference=excluded.cash_difference,entries_count=excluded.entries_count,
  notes=excluded.notes,closed_at=now(),closed_by=me
 returning c.id into closing_id;
 return closing_id;
end $$;

create or replace function public.cash_flow_reopen_day(target_unit uuid,target_date date,reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.cash_flow_daily_closings;
begin
 if not public.has_permission('finance.cash_flow.manage') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.cash_flow_daily_closings where business_unit_id=target_unit and closing_date=target_date for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status<>'closed' then raise exception 'El dia no esta cerrado'; end if;
 if nullif(btrim(reason),'') is null then raise exception 'Indica el motivo de la reapertura'; end if;
 update public.cash_flow_daily_closings set status='reopened',reopened_at=now(),reopened_by=auth.uid(),reopen_reason=btrim(reason) where id=c.id;
end $$;

create or replace function public.cash_flow_create_category(target_unit uuid,target_kind text,category_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare unit public.business_units; cat_id uuid:=gen_random_uuid();
begin
 if not public.has_permission('finance.cash_flow.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad de negocio no autorizada'; end if;
 if target_kind not in('income','expense') then raise exception 'Tipo de categoria invalido'; end if;
 if char_length(coalesce(btrim(category_name),''))<2 then raise exception 'El nombre de la categoria es obligatorio'; end if;
 if exists(select 1 from public.cash_flow_categories where business_unit_id=unit.id and kind=target_kind and lower(name)=lower(btrim(category_name))) then
  raise exception 'La categoria ya existe';
 end if;
 insert into public.cash_flow_categories(id,company_id,business_unit_id,kind,name,created_by)
 values(cat_id,unit.company_id,unit.id,target_kind,btrim(category_name),auth.uid());
 return cat_id;
end $$;

create or replace function public.cash_flow_toggle_category(target_category uuid,is_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare cat public.cash_flow_categories;
begin
 if not public.has_permission('finance.cash_flow.manage') then raise exception 'Sin autorizacion'; end if;
 select * into cat from public.cash_flow_categories where id=target_category for update;
 if cat.id is null or not public.can_access_unit(cat.company_id,cat.business_unit_id) then raise exception 'Categoria no encontrada'; end if;
 update public.cash_flow_categories set active=is_active,updated_by=auth.uid() where id=cat.id;
end $$;

alter table public.cash_flow_categories enable row level security;
alter table public.cash_flow_entries enable row level security;
alter table public.cash_flow_daily_closings enable row level security;

create policy cash_flow_categories_select on public.cash_flow_categories for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.cash_flow.view'));
create policy cash_flow_entries_select on public.cash_flow_entries for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.cash_flow.view'));
create policy cash_flow_daily_closings_select on public.cash_flow_daily_closings for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.cash_flow.view'));

revoke all on public.cash_flow_categories,public.cash_flow_entries,public.cash_flow_daily_closings from public,anon,authenticated;
grant select on public.cash_flow_categories,public.cash_flow_entries,public.cash_flow_daily_closings to authenticated;

revoke execute on function public.cash_flow_seed_new_unit() from public,anon,authenticated;
revoke execute on function public.cash_flow_day_is_closed(uuid,date),public.cash_flow_record_entry(jsonb),public.cash_flow_void_entry(uuid,text),
 public.cash_flow_close_day(uuid,date,jsonb),public.cash_flow_reopen_day(uuid,date,text),
 public.cash_flow_create_category(uuid,text,text),public.cash_flow_toggle_category(uuid,boolean) from public,anon;
grant execute on function public.cash_flow_today(),public.cash_flow_day_is_closed(uuid,date),public.cash_flow_record_entry(jsonb),public.cash_flow_void_entry(uuid,text),
 public.cash_flow_close_day(uuid,date,jsonb),public.cash_flow_reopen_day(uuid,date,text),
 public.cash_flow_create_category(uuid,text,text),public.cash_flow_toggle_category(uuid,boolean) to authenticated;

commit;
