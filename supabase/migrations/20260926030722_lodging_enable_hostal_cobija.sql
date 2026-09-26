begin;

-- Habilita Gestión de reservas y cierre diario para Hostal Oasis Cobija (HOB),
-- igual que HU y HOC. Solo cambia la lista de unidades permitidas en el
-- guardado del cierre; el resto de las funciones de hostal ya son genéricas
-- por business_unit_id.
create or replace function public.lodging_save_daily_closing(target_unit uuid,target_date date,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; c public.lodging_daily_closings; saved_id uuid;
 today date:=(now() at time zone 'America/Santiago')::date; line jsonb; line_amount numeric; line_method text;
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
  if char_length(coalesce(btrim(line->>'description'),''))<2 then raise exception 'Cada gasto requiere descripcion'; end if;
  if line_amount is null or line_amount<=0 then raise exception 'El monto de cada gasto debe ser mayor a cero'; end if;
  if line_method not in('cash','transfer','card','other') then raise exception 'Medio de pago invalido'; end if;
  insert into public.lodging_daily_closing_expenses(company_id,business_unit_id,closing_id,description,amount,payment_method,created_by)
  values(unit.company_id,unit.id,saved_id,btrim(line->>'description'),line_amount,line_method,me);
 end loop;

 perform public.lodging_apply_closing_snapshot(saved_id);
 return saved_id;
end $$;

commit;
