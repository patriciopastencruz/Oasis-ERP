begin;

-- Bono del supervisor de cada hostal: un monto propio por hostal y su resultado
-- guardado junto al del bono de recepción (60% resultado del hostal y cuatro
-- controles de supervisión de cumple o no cumple).
alter table public.lodging_bonus_config
  add column supervisor_pool_amount numeric(14,0) not null default 0 check(supervisor_pool_amount>=0);
alter table public.lodging_bonus_results
  add column supervisor_points numeric(5,2),
  add column supervisor_amount numeric(14,0);

update public.lodging_bonus_config set supervisor_pool_amount=150000,updated_at=now();

create or replace function public.lodging_save_bonus_config(target_unit uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; w jsonb:=payload->'weights'; k text; total int:=0; v int; wait int:=(payload->>'inspection_max_wait_minutes')::int; sp numeric:=(payload->>'supervisor_pool_amount')::numeric;
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 foreach k in array array['occupancy','adr','booking','survey','inspections','order'] loop
  v:=(w->>k)::int;
  if v is null or v<0 or v>100 then raise exception 'Cada peso debe estar entre 0 y 100'; end if;
  total:=total+v;
 end loop;
 if total<>100 then raise exception 'Los pesos deben sumar 100 (suman %)',total; end if;
 if wait is null or wait<1 or wait>1440 then raise exception 'El tiempo maximo de inspeccion va de 1 a 1440 minutos'; end if;
 if sp is not null and sp<0 then raise exception 'El monto del supervisor no puede ser negativo'; end if;
 insert into public.lodging_bonus_config(company_id,business_unit_id,pool_amount,weights,survey_goal,survey_min_responses,inspection_max_wait_minutes,supervisor_pool_amount,updated_by,updated_at)
 values(unit.company_id,unit.id,(payload->>'pool_amount')::numeric,
  jsonb_build_object('occupancy',(w->>'occupancy')::int,'adr',(w->>'adr')::int,'booking',(w->>'booking')::int,'survey',(w->>'survey')::int,'inspections',(w->>'inspections')::int,'order',(w->>'order')::int),
  (payload->>'survey_goal')::numeric,(payload->>'survey_min_responses')::int,wait,coalesce(sp,0),auth.uid(),now())
 on conflict(business_unit_id) do update set pool_amount=excluded.pool_amount,weights=excluded.weights,survey_goal=excluded.survey_goal,
  survey_min_responses=excluded.survey_min_responses,inspection_max_wait_minutes=excluded.inspection_max_wait_minutes,
  supervisor_pool_amount=coalesce(sp,public.lodging_bonus_config.supervisor_pool_amount),updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke execute on function public.lodging_save_bonus_config(uuid,jsonb) from public,anon;
grant execute on function public.lodging_save_bonus_config(uuid,jsonb) to authenticated;

create or replace function public.lodging_save_bonus_result(target_unit uuid,target_month date,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units;
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if target_month<>date_trunc('month',target_month)::date then raise exception 'El mes debe ser el primer dia'; end if;
 if target_month>=date_trunc('month',(now() at time zone 'America/Santiago')::date)::date then raise exception 'Solo se guarda el resultado de un mes ya terminado'; end if;
 insert into public.lodging_bonus_results(company_id,business_unit_id,month,pool_amount,points,amount,gate_applied,detail,supervisor_points,supervisor_amount,saved_by,saved_at)
 values(unit.company_id,unit.id,target_month,(payload->>'pool_amount')::numeric,(payload->>'points')::numeric,(payload->>'amount')::numeric,
  coalesce((payload->>'gate_applied')::boolean,false),coalesce(payload->'detail','{}'::jsonb),
  (payload->>'supervisor_points')::numeric,(payload->>'supervisor_amount')::numeric,auth.uid(),now())
 on conflict(business_unit_id,month) do update set pool_amount=excluded.pool_amount,points=excluded.points,amount=excluded.amount,
  gate_applied=excluded.gate_applied,detail=excluded.detail,supervisor_points=excluded.supervisor_points,supervisor_amount=excluded.supervisor_amount,
  saved_by=excluded.saved_by,saved_at=excluded.saved_at;
end $$;
revoke execute on function public.lodging_save_bonus_result(uuid,date,jsonb) from public,anon;
grant execute on function public.lodging_save_bonus_result(uuid,date,jsonb) to authenticated;

commit;
