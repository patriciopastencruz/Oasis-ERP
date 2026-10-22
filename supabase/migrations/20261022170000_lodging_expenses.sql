begin;

-- Gastos del hostal: ingreso simple de gastos con tipo de gasto (aseo y limpieza, luz, agua, gas, insumos de
-- cocina...). Por ahora solo Hostal Uruguay. Los tipos son las categorías del cierre mensual gerencial
-- (lodging_finance_categories), de modo que después alimentan el estado de resultados. Los gastos no se
-- eliminan: se anulan con motivo y todo queda en la auditoría.

insert into public.permissions(key,module,description) values
 ('lodging.expenses.view','lodging','Ver los gastos del hostal'),
 ('lodging.expenses.record','lodging','Ingresar gastos del hostal y anular los propios del día'),
 ('lodging.expenses.manage','lodging','Anular cualquier gasto, ingresar con fecha anterior y administrar los tipos de gasto')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key in('lodging.expenses.view','lodging.expenses.record')
 and r.key in('superadmin','general_manager','finance_manager','administrator','receptionist')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.expenses.manage'
 and r.key in('superadmin','general_manager','finance_manager','administrator')
on conflict do nothing;

-- ---------- Tipos de gasto: se reutiliza el catálogo del cierre mensual ----------
alter table public.lodging_finance_categories add column allow_expenses boolean not null default false;

-- Tipos nuevos de Hostal Uruguay y los existentes que sirven para el ingreso de gastos.
insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,allow_expenses,sort_order)
select u.company_id,u.id,v.section,v.name,false,true,v.sort_order
from public.business_units u
cross join (values
 ('variable','Aseo y limpieza',31),
 ('variable','Insumos de cocina',32),
 ('variable','Insumos de baño y amenities',33),
 ('variable','Lavandería',34),
 ('fixed','Luz',11),
 ('fixed','Agua',12),
 ('fixed','Internet y telefonía',13)
) as v(section,name,sort_order)
where u.code='HU' and u.deleted_at is null
on conflict(business_unit_id,name) do update set allow_expenses=true,active=true;

update public.lodging_finance_categories c set allow_expenses=true
from public.business_units u
where u.id=c.business_unit_id and u.code='HU'
 and c.name in('Gas y combustible','Reparaciones y mantenimiento','Marketing y publicidad','Almuerzos y alimentación','Otros gastos variables');

-- ---------- Gastos ----------
create table public.lodging_expenses(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 expense_date date not null,
 category_id uuid not null references public.lodging_finance_categories(id),
 description text not null check(char_length(btrim(description)) between 2 and 200),
 supplier text check(supplier is null or char_length(supplier)<=120),
 document_number text check(document_number is null or char_length(document_number)<=60),
 amount numeric(14,0) not null check(amount>0),
 payment_method text not null check(payment_method in('cash','transfer','debit_card','credit_card','other')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),
 voided_at timestamptz,voided_by uuid references public.profiles(id),void_reason text,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check((voided_at is null)=(void_reason is null))
);
create index lodging_expenses_unit_date_idx on public.lodging_expenses(company_id,business_unit_id,expense_date) where voided_at is null;
create index lodging_expenses_category_idx on public.lodging_expenses(category_id);
create index lodging_expenses_created_by_idx on public.lodging_expenses(created_by);

create trigger lodging_expenses_updated_at before update on public.lodging_expenses for each row execute function public.set_updated_at();
create trigger audit_lodging_expenses after insert or update or delete on public.lodging_expenses for each row execute function public.audit_row_change();

alter table public.lodging_expenses enable row level security;
create policy lodging_expenses_select on public.lodging_expenses for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.expenses.view'));
revoke all on public.lodging_expenses from public,anon,authenticated;
grant select on public.lodging_expenses to authenticated;

-- ---------- Funciones ----------
create or replace function public.lodging_expenses_assert_unit(target_unit uuid) returns public.business_units language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units;
begin
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 -- Por ahora el ingreso de gastos existe solo en Hostal Uruguay.
 if unit.id is null or unit.code not in('HU') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 return unit;
end $$;
revoke execute on function public.lodging_expenses_assert_unit(uuid) from public,anon,authenticated;

create or replace function public.lodging_record_expense(target_unit uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 unit public.business_units;
 cat public.lodging_finance_categories;
 today date:=(now() at time zone 'America/Santiago')::date;
 v_date date:=(payload->>'expense_date')::date;
 v_amount numeric:=(payload->>'amount')::numeric;
 v_desc text:=btrim(coalesce(payload->>'description',''));
 v_method text:=payload->>'payment_method';
 v_id uuid;
begin
 if not public.has_permission('lodging.expenses.record') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_expenses_assert_unit(target_unit);
 select * into cat from public.lodging_finance_categories where id=(payload->>'category_id')::uuid and business_unit_id=unit.id and active and allow_expenses;
 if cat.id is null then raise exception 'Tipo de gasto no valido'; end if;
 if v_date is null then raise exception 'Indica la fecha del gasto'; end if;
 if v_date>today then raise exception 'La fecha del gasto no puede ser futura'; end if;
 if v_date<today-62 and not public.has_permission('lodging.expenses.manage') then raise exception 'Solo un administrador puede ingresar gastos de hace mas de 60 dias'; end if;
 if v_amount is null or v_amount<=0 or v_amount<>trunc(v_amount) or v_amount>100000000 then raise exception 'El monto debe ser un numero entero mayor que 0'; end if;
 if char_length(v_desc)<2 or char_length(v_desc)>200 then raise exception 'La descripcion debe tener entre 2 y 200 caracteres'; end if;
 if v_method is null or v_method not in('cash','transfer','debit_card','credit_card','other') then raise exception 'Forma de pago no valida'; end if;
 insert into public.lodging_expenses(company_id,business_unit_id,expense_date,category_id,description,supplier,document_number,amount,payment_method,created_by)
 values(unit.company_id,unit.id,v_date,cat.id,v_desc,nullif(btrim(coalesce(payload->>'supplier','')),''),nullif(btrim(coalesce(payload->>'document_number','')),''),v_amount,v_method,auth.uid())
 returning id into v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_record_expense(uuid,jsonb) from public,anon;
grant execute on function public.lodging_record_expense(uuid,jsonb) to authenticated;

create or replace function public.lodging_void_expense(target_expense uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare
 e public.lodging_expenses;
 today date:=(now() at time zone 'America/Santiago')::date;
 v_reason text:=btrim(coalesce(reason,''));
begin
 if not public.has_permission('lodging.expenses.record') then raise exception 'Sin autorizacion'; end if;
 select * into e from public.lodging_expenses where id=target_expense for update;
 if e.id is null or not public.can_access_unit(e.company_id,e.business_unit_id) then raise exception 'Gasto no encontrado'; end if;
 if e.voided_at is not null then raise exception 'El gasto ya esta anulado'; end if;
 if char_length(v_reason)<3 or char_length(v_reason)>300 then raise exception 'Indica el motivo de la anulacion (3 a 300 caracteres)'; end if;
 -- Quien solo ingresa gastos puede anular los suyos, el mismo dia; administracion puede anular cualquiera.
 if not public.has_permission('lodging.expenses.manage')
    and (e.created_by<>auth.uid() or (e.created_at at time zone 'America/Santiago')::date<>today) then
  raise exception 'Solo puedes anular un gasto que ingresaste hoy; pide a administracion anular los demas';
 end if;
 update public.lodging_expenses set voided_at=now(),voided_by=auth.uid(),void_reason=v_reason where id=e.id;
end $$;
revoke execute on function public.lodging_void_expense(uuid,text) from public,anon;
grant execute on function public.lodging_void_expense(uuid,text) to authenticated;

create or replace function public.lodging_add_expense_category(target_unit uuid,category_name text,category_section text) returns uuid language plpgsql security definer set search_path='' as $$
declare unit public.business_units; v_name text:=btrim(coalesce(category_name,'')); v_id uuid;
begin
 if not public.has_permission('lodging.expenses.manage') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_expenses_assert_unit(target_unit);
 if char_length(v_name) not between 2 and 80 then raise exception 'El nombre debe tener entre 2 y 80 caracteres'; end if;
 if category_section is null or category_section not in('fixed','variable','investment','other') then raise exception 'Seccion no valida'; end if;
 insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,allow_expenses,sort_order,created_by)
 values(unit.company_id,unit.id,category_section,v_name,false,true,100,auth.uid())
 on conflict(business_unit_id,name) do update set allow_expenses=true,active=true,updated_by=auth.uid()
 returning id into v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_add_expense_category(uuid,text,text) from public,anon;
grant execute on function public.lodging_add_expense_category(uuid,text,text) to authenticated;

-- Quitar un tipo de la lista de gastos (no se borra: sigue en el cierre mensual y en los gastos ya ingresados).
-- Para volver a mostrarlo basta agregarlo otra vez con el mismo nombre.
create or replace function public.lodging_remove_expense_category(target_category uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_finance_categories;
begin
 if not public.has_permission('lodging.expenses.manage') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_finance_categories where id=target_category and allow_expenses for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Tipo de gasto no encontrado'; end if;
 perform public.lodging_expenses_assert_unit(c.business_unit_id);
 update public.lodging_finance_categories set allow_expenses=false,updated_by=auth.uid() where id=c.id;
end $$;
revoke execute on function public.lodging_remove_expense_category(uuid) from public,anon;
grant execute on function public.lodging_remove_expense_category(uuid) to authenticated;

commit;
