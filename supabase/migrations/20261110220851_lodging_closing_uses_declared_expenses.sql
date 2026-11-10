begin;

-- Cierre diario: el gasto del día es el que se ingresa en el módulo Gastos (lodging_expenses, no anulados).
-- Al guardar o emitir el cierre, esos gastos se copian a lodging_daily_closing_expenses (con source_expense_id),
-- de modo que el total, el detalle, el PDF, el correo y los reportes siguen leyendo la misma tabla.
-- Si el día no tiene gastos declarados, se conservan las líneas manuales antiguas del cierre (cierres históricos).
alter table public.lodging_daily_closing_expenses add column source_expense_id uuid references public.lodging_expenses(id);
create index lodging_daily_closing_expenses_source_idx on public.lodging_daily_closing_expenses(source_expense_id) where source_expense_id is not null;

create or replace function public.lodging_apply_closing_snapshot(target_closing uuid) returns void language plpgsql security definer set search_path='' as $function$
declare c public.lodging_daily_closings; m jsonb; expenses numeric; received numeric; declared_n int; actor uuid:=auth.uid();
begin
 select * into strict c from public.lodging_daily_closings where id=target_closing;
 m:=public.lodging_closing_metrics_internal(c.business_unit_id,c.closing_date);
 select count(*) into declared_n from public.lodging_expenses e
  where e.business_unit_id=c.business_unit_id and e.expense_date=c.closing_date and e.voided_at is null;
 -- Las copias anteriores siempre se rehacen; las líneas manuales antiguas solo se reemplazan si hay gastos declarados.
 update public.lodging_daily_closing_expenses set deleted_at=now(),deleted_by=actor
  where closing_id=c.id and deleted_at is null and (source_expense_id is not null or declared_n>0);
 insert into public.lodging_daily_closing_expenses(company_id,business_unit_id,closing_id,category_id,description,amount,payment_method,created_by,source_expense_id)
 select c.company_id,c.business_unit_id,c.id,e.category_id,e.description,e.amount,
  case when e.payment_method in('debit_card','credit_card') then 'card' else e.payment_method end,
  coalesce(actor,e.created_by),e.id
 from public.lodging_expenses e
 where e.business_unit_id=c.business_unit_id and e.expense_date=c.closing_date and e.voided_at is null
 order by e.created_at;
 select coalesce(sum(amount),0) into expenses from public.lodging_daily_closing_expenses where closing_id=c.id and deleted_at is null;
 received:=(m->>'total_received')::numeric;
 update public.lodging_daily_closings set
  metrics=m,
  total_rooms=(m->>'total_rooms')::int,
  occupied_rooms=(m->>'occupied_rooms')::int,
  occupancy_pct=(m->>'occupancy_pct')::numeric,
  average_rate=(m->>'average_rate')::numeric,
  cash_received=(m->'payments_by_method'->>'cash')::numeric,
  transfer_received=(m->'payments_by_method'->>'transfer')::numeric,
  card_received=(m->'payments_by_method'->>'card')::numeric,
  airbnb_received=(m->'payments_by_method'->>'airbnb')::numeric,
  other_received=received-(m->'payments_by_method'->>'cash')::numeric-(m->'payments_by_method'->>'transfer')::numeric
   -(m->'payments_by_method'->>'card')::numeric-(m->'payments_by_method'->>'airbnb')::numeric,
  total_received=received,
  pending_amount=(m->>'pending_amount')::numeric,
  expense_total=expenses,
  net_result=received-expenses
 where id=c.id;
end $function$;

-- Guardar ya no recibe gastos: solo observaciones. El gasto sale del módulo Gastos al recalcular el cierre.
create or replace function public.lodging_save_daily_closing(target_unit uuid,target_date date,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $function$
declare me uuid:=auth.uid(); unit public.business_units; c public.lodging_daily_closings; saved_id uuid;
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if target_date is null or target_date>today then raise exception 'No se puede cerrar una fecha futura'; end if;
 if target_date<today-1 and not public.has_permission('lodging.closings.manage') and not public.lodging_closing_date_authorized(unit.id,target_date) then
  raise exception 'Para cerrar una fecha anterior a ayer necesitas autorizacion del administrador'; end if;
 select * into c from public.lodging_daily_closings where business_unit_id=unit.id and closing_date=target_date for update;
 -- Recepción también puede corregir un cierre ya emitido (dentro de la ventana de hoy y ayer,
 -- validada arriba): guardar lo deja en borrador y debe emitirse de nuevo.

 insert into public.lodging_daily_closings as d(company_id,business_unit_id,closing_date,status,reported_problems,items_to_replenish,observations,created_by)
 values(unit.company_id,unit.id,target_date,'draft',nullif(btrim(payload->>'reported_problems'),''),nullif(btrim(payload->>'items_to_replenish'),''),nullif(btrim(payload->>'observations'),''),me)
 on conflict(business_unit_id,closing_date) do update set status='draft',reported_problems=excluded.reported_problems,
  items_to_replenish=excluded.items_to_replenish,observations=excluded.observations,updated_by=me
 returning d.id into saved_id;

 perform public.lodging_apply_closing_snapshot(saved_id);
 return saved_id;
end $function$;

commit;
