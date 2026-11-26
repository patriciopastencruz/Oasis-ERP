begin;

-- Editar un gasto ya ingresado. Quien puede ingresar gastos (recepcionista incluida) corrige los del mes en curso;
-- administración (lodging.expenses.manage) puede corregir los de cualquier mes. Un gasto anulado no se edita.
-- El comprobante es opcional al editar: si se sube uno nuevo reemplaza al anterior (el archivo anterior se conserva).
-- Cada cambio queda en audit_logs por el trigger de la tabla.

create or replace function public.lodging_update_expense(target_expense uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 e public.lodging_expenses;
 unit public.business_units;
 cat public.lodging_finance_categories;
 today date:=(now() at time zone 'America/Santiago')::date;
 month_start date:=date_trunc('month',(now() at time zone 'America/Santiago'))::date;
 manager boolean:=public.has_permission('lodging.expenses.manage');
 v_date date:=(payload->>'expense_date')::date;
 v_amount numeric:=(payload->>'amount')::numeric;
 v_desc text:=btrim(coalesce(payload->>'description',''));
 v_method text:=payload->>'payment_method';
 v_cat uuid:=nullif(payload->>'category_id','')::uuid;
 v_path text:=nullif(payload->>'receipt_path','');
 v_rname text:=btrim(coalesce(payload->>'receipt_name',''));
 v_mime text:=payload->>'receipt_mime';
 v_size integer:=(payload->>'receipt_size')::integer;
begin
 if not public.has_permission('lodging.expenses.record') then raise exception 'Sin autorizacion'; end if;
 select * into e from public.lodging_expenses where id=target_expense for update;
 if e.id is null or not public.can_access_unit(e.company_id,e.business_unit_id) then raise exception 'Gasto no encontrado'; end if;
 unit:=public.lodging_expenses_assert_unit(e.business_unit_id);
 if e.voided_at is not null then raise exception 'No se puede editar un gasto anulado'; end if;
 if not manager and e.expense_date<month_start then raise exception 'Solo se pueden editar los gastos del mes en curso; pide a administracion corregir los anteriores'; end if;
 if v_date is null then raise exception 'Indica la fecha del gasto'; end if;
 if v_date>today then raise exception 'La fecha del gasto no puede ser futura'; end if;
 if not manager and v_date<month_start then raise exception 'La fecha debe ser del mes en curso'; end if;
 if v_cat is null then raise exception 'Elige el tipo de gasto'; end if;
 select * into cat from public.lodging_finance_categories where id=v_cat and business_unit_id=unit.id and active and allow_expenses;
 if cat.id is null then raise exception 'Tipo de gasto no valido'; end if;
 if v_amount is null or v_amount<=0 or v_amount<>trunc(v_amount) or v_amount>100000000 then raise exception 'El monto debe ser un numero entero mayor que 0'; end if;
 if char_length(v_desc)<2 or char_length(v_desc)>200 then raise exception 'La descripcion debe tener entre 2 y 200 caracteres'; end if;
 if v_method is null or v_method not in('cash','transfer','debit_card','credit_card','other') then raise exception 'Forma de pago no valida'; end if;
 if v_path is not null then
  if v_path like '%..%' or left(v_path,length(unit.company_id::text)+length(unit.id::text)+2)<>unit.company_id::text||'/'||unit.id::text||'/' then
   raise exception 'El comprobante no es valido';
  end if;
  if v_mime is null or v_mime not in('application/pdf','image/jpeg','image/png','image/webp') or v_size is null or v_size<1 or v_size>10485760 or char_length(v_rname) not between 1 and 200 then
   raise exception 'El comprobante no es valido';
  end if;
 end if;
 update public.lodging_expenses set
  expense_date=v_date,
  category_id=cat.id,
  description=v_desc,
  supplier=nullif(btrim(coalesce(payload->>'supplier','')),''),
  document_number=nullif(btrim(coalesce(payload->>'document_number','')),''),
  amount=v_amount,
  payment_method=v_method,
  receipt_path=coalesce(v_path,receipt_path),
  receipt_name=case when v_path is null then receipt_name else v_rname end,
  receipt_mime=case when v_path is null then receipt_mime else v_mime end,
  receipt_size=case when v_path is null then receipt_size else v_size end
 where id=e.id;
end $$;
revoke execute on function public.lodging_update_expense(uuid,jsonb) from public,anon;
grant execute on function public.lodging_update_expense(uuid,jsonb) to authenticated;

commit;
