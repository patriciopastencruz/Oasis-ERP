begin;

-- Gastos del hostal, segunda parte:
--  * El tipo de gasto lo asigna solo administración (administrador y superadministrador): quien ingresa el gasto
--    no lo elige, el gasto queda "sin clasificar" hasta que se le asigna un tipo.
--  * El comprobante del gasto es obligatorio: se adjunta al ingresarlo y queda en un bucket privado.

insert into public.permissions(key,module,description) values
 ('lodging.expenses.classify','lodging','Asignar y cambiar el tipo de los gastos del hostal y administrar los tipos de gasto')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.expenses.classify' and r.key in('superadmin','administrator')
on conflict do nothing;

-- ---------- Tipo opcional al ingresar; comprobante obligatorio ----------
alter table public.lodging_expenses alter column category_id drop not null;
alter table public.lodging_expenses
 add column receipt_path text,
 add column receipt_name text,
 add column receipt_mime text,
 add column receipt_size integer;
alter table public.lodging_expenses
 alter column receipt_path set not null,
 alter column receipt_name set not null,
 alter column receipt_mime set not null,
 alter column receipt_size set not null,
 add constraint lodging_expenses_receipt_mime_check check(receipt_mime in('application/pdf','image/jpeg','image/png','image/webp')),
 add constraint lodging_expenses_receipt_size_check check(receipt_size between 1 and 10485760);

-- ---------- Comprobantes: bucket privado ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lodging-expense-receipts','lodging-expense-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy lodging_expense_receipt_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='lodging-expense-receipts' and public.has_permission('lodging.expenses.record')
 and exists(select 1 from public.user_business_units ubu where ubu.user_id=(select auth.uid()) and ubu.business_unit_id::text=(storage.foldername(name))[2]));
create policy lodging_expense_receipt_objects_read on storage.objects for select to authenticated
using (bucket_id='lodging-expense-receipts' and public.has_permission('lodging.expenses.view')
 and exists(select 1 from public.user_business_units ubu where ubu.user_id=(select auth.uid()) and ubu.business_unit_id::text=(storage.foldername(name))[2]));
-- Solo se puede borrar un archivo que no quedó asociado a ningún gasto (por ejemplo, si falló el guardado).
create policy lodging_expense_receipt_objects_delete on storage.objects for delete to authenticated
using (bucket_id='lodging-expense-receipts' and public.has_permission('lodging.expenses.record')
 and exists(select 1 from public.user_business_units ubu where ubu.user_id=(select auth.uid()) and ubu.business_unit_id::text=(storage.foldername(name))[2])
 and not exists(select 1 from public.lodging_expenses e where e.receipt_path=name));

-- ---------- Ingreso de un gasto: tipo solo si puede clasificar; comprobante obligatorio ----------
create or replace function public.lodging_record_expense(target_unit uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 unit public.business_units;
 cat public.lodging_finance_categories;
 today date:=(now() at time zone 'America/Santiago')::date;
 v_date date:=(payload->>'expense_date')::date;
 v_amount numeric:=(payload->>'amount')::numeric;
 v_desc text:=btrim(coalesce(payload->>'description',''));
 v_method text:=payload->>'payment_method';
 v_cat uuid:=nullif(payload->>'category_id','')::uuid;
 v_path text:=payload->>'receipt_path';
 v_rname text:=btrim(coalesce(payload->>'receipt_name',''));
 v_mime text:=payload->>'receipt_mime';
 v_size integer:=(payload->>'receipt_size')::integer;
 v_id uuid;
begin
 if not public.has_permission('lodging.expenses.record') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_expenses_assert_unit(target_unit);
 if v_cat is not null then
  if not public.has_permission('lodging.expenses.classify') then raise exception 'Sin autorizacion para asignar el tipo de gasto'; end if;
  select * into cat from public.lodging_finance_categories where id=v_cat and business_unit_id=unit.id and active and allow_expenses;
  if cat.id is null then raise exception 'Tipo de gasto no valido'; end if;
 end if;
 if v_date is null then raise exception 'Indica la fecha del gasto'; end if;
 if v_date>today then raise exception 'La fecha del gasto no puede ser futura'; end if;
 if v_date<today-62 and not public.has_permission('lodging.expenses.manage') then raise exception 'Solo un administrador puede ingresar gastos de hace mas de 60 dias'; end if;
 if v_amount is null or v_amount<=0 or v_amount<>trunc(v_amount) or v_amount>100000000 then raise exception 'El monto debe ser un numero entero mayor que 0'; end if;
 if char_length(v_desc)<2 or char_length(v_desc)>200 then raise exception 'La descripcion debe tener entre 2 y 200 caracteres'; end if;
 if v_method is null or v_method not in('cash','transfer','debit_card','credit_card','other') then raise exception 'Forma de pago no valida'; end if;
 -- Comprobante obligatorio, guardado en la carpeta de este hostal.
 if v_path is null or v_path='' or v_path like '%..%' or left(v_path,length(unit.company_id::text)+length(unit.id::text)+2)<>unit.company_id::text||'/'||unit.id::text||'/' then
  raise exception 'Adjunta el comprobante del gasto';
 end if;
 if v_mime is null or v_mime not in('application/pdf','image/jpeg','image/png','image/webp') or v_size is null or v_size<1 or v_size>10485760 or char_length(v_rname) not between 1 and 200 then
  raise exception 'El comprobante no es valido';
 end if;
 insert into public.lodging_expenses(company_id,business_unit_id,expense_date,category_id,description,supplier,document_number,amount,payment_method,created_by,receipt_path,receipt_name,receipt_mime,receipt_size)
 values(unit.company_id,unit.id,v_date,cat.id,v_desc,nullif(btrim(coalesce(payload->>'supplier','')),''),nullif(btrim(coalesce(payload->>'document_number','')),''),v_amount,v_method,auth.uid(),v_path,v_rname,v_mime,v_size)
 returning id into v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_record_expense(uuid,jsonb) from public,anon;
grant execute on function public.lodging_record_expense(uuid,jsonb) to authenticated;

-- ---------- Asignar o cambiar el tipo de un gasto (solo administración) ----------
create or replace function public.lodging_classify_expense(target_expense uuid,target_category uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.lodging_expenses; cat public.lodging_finance_categories;
begin
 if not public.has_permission('lodging.expenses.classify') then raise exception 'Sin autorizacion'; end if;
 select * into e from public.lodging_expenses where id=target_expense for update;
 if e.id is null or not public.can_access_unit(e.company_id,e.business_unit_id) then raise exception 'Gasto no encontrado'; end if;
 perform public.lodging_expenses_assert_unit(e.business_unit_id);
 if e.voided_at is not null then raise exception 'No se puede clasificar un gasto anulado'; end if;
 select * into cat from public.lodging_finance_categories where id=target_category and business_unit_id=e.business_unit_id and active and allow_expenses;
 if cat.id is null then raise exception 'Tipo de gasto no valido'; end if;
 update public.lodging_expenses set category_id=cat.id where id=e.id;
end $$;
revoke execute on function public.lodging_classify_expense(uuid,uuid) from public,anon;
grant execute on function public.lodging_classify_expense(uuid,uuid) to authenticated;

-- ---------- Los tipos de gasto los administra solo quien puede clasificar ----------
create or replace function public.lodging_add_expense_category(target_unit uuid,category_name text,category_section text) returns uuid language plpgsql security definer set search_path='' as $$
declare unit public.business_units; v_name text:=btrim(coalesce(category_name,'')); v_id uuid;
begin
 if not public.has_permission('lodging.expenses.classify') then raise exception 'Sin autorizacion'; end if;
 unit:=public.lodging_expenses_assert_unit(target_unit);
 if char_length(v_name) not between 2 and 80 then raise exception 'El nombre debe tener entre 2 y 80 caracteres'; end if;
 if category_section is null or category_section not in('fixed','variable','investment','other') then raise exception 'Seccion no valida'; end if;
 insert into public.lodging_finance_categories(company_id,business_unit_id,section,name,allow_daily,allow_expenses,sort_order,created_by)
 values(unit.company_id,unit.id,category_section,v_name,false,true,100,auth.uid())
 on conflict(business_unit_id,name) do update set allow_expenses=true,active=true,updated_by=auth.uid()
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.lodging_remove_expense_category(target_category uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_finance_categories;
begin
 if not public.has_permission('lodging.expenses.classify') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_finance_categories where id=target_category and allow_expenses for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Tipo de gasto no encontrado'; end if;
 perform public.lodging_expenses_assert_unit(c.business_unit_id);
 update public.lodging_finance_categories set allow_expenses=false,updated_by=auth.uid() where id=c.id;
end $$;

commit;
