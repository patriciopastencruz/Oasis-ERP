begin;

-- Gastos del hostal: quien ingresa el gasto (recepcionista incluida) elige el tipo entre los ya configurados.
-- Lo que sigue reservado a administrador y superadministrador es administrar la lista de tipos (agregar y quitar)
-- y cambiar el tipo de un gasto ya ingresado.

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
 if v_cat is null then raise exception 'Elige el tipo de gasto'; end if;
 select * into cat from public.lodging_finance_categories where id=v_cat and business_unit_id=unit.id and active and allow_expenses;
 if cat.id is null then raise exception 'Tipo de gasto no valido'; end if;
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

commit;
