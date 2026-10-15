begin;

-- Recepción puede corregir un cierre ya emitido y volver a emitirlo, por si se
-- hizo mal. Antes solo quien administra cierres (lodging.closings.manage) podía
-- reabrirlo. Se mantiene el límite de fechas: recepción solo trabaja el día de
-- hoy y el anterior. Guardar deja el cierre en borrador (queda en la auditoría)
-- y al emitirlo de nuevo se recalcula y se vuelve a avisar a administración.

CREATE OR REPLACE FUNCTION public.lodging_save_daily_closing(target_unit uuid, target_date date, payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- Recepción también puede corregir un cierre ya emitido (dentro de la ventana de hoy y ayer,
 -- validada arriba): guardar lo deja en borrador y debe emitirse de nuevo.

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
end $function$;

commit;
