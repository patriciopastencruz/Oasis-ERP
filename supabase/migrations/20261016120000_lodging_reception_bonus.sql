begin;

-- Bono mensual de recepción por cumplimiento de metas, un monto fijo por hostal.
-- La configuración (monto, pesos y metas propias del bono) y el resultado
-- guardado de cada mes viven aquí; los indicadores salen de los reportes.

insert into public.permissions(key,module,description) values
 ('kpis.bonus.manage','kpis','Configurar el bono de recepción (monto, pesos y metas) y guardar el resultado de cada mes')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='kpis.bonus.manage' and r.key in('general_manager','superadmin')
on conflict do nothing;

create table public.lodging_bonus_config(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 pool_amount numeric(14,0) not null default 0 check(pool_amount>=0),
 -- Puntos por indicador (suman 100).
 weights jsonb not null default '{"occupancy":25,"revpar":25,"booking":20,"survey":10,"housekeeping":5,"order":15}',
 survey_goal numeric(3,2) not null default 4.50 check(survey_goal between 1 and 5),
 survey_min_responses integer not null default 5 check(survey_min_responses>=0),
 housekeeping_goal numeric(5,2) not null default 85 check(housekeeping_goal between 0 and 100),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id)
);

create table public.lodging_bonus_results(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 month date not null check(month=date_trunc('month',month)::date),
 pool_amount numeric(14,0) not null,
 points numeric(5,2) not null,
 amount numeric(14,0) not null,
 gate_applied boolean not null default false,
 detail jsonb not null default '{}'::jsonb,
 saved_by uuid references public.profiles(id),
 saved_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,month)
);

alter table public.lodging_bonus_config enable row level security;
alter table public.lodging_bonus_results enable row level security;
create policy lodging_bonus_config_read on public.lodging_bonus_config for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('kpis.view'));
create policy lodging_bonus_results_read on public.lodging_bonus_results for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('kpis.view'));
revoke all on public.lodging_bonus_config,public.lodging_bonus_results from public,anon,authenticated;
grant select on public.lodging_bonus_config,public.lodging_bonus_results to authenticated;
grant select,insert,update on public.lodging_bonus_config,public.lodging_bonus_results to service_role;

create or replace function public.lodging_save_bonus_config(target_unit uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; w jsonb:=payload->'weights'; k text; total int:=0; v int;
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 foreach k in array array['occupancy','revpar','booking','survey','housekeeping','order'] loop
  v:=(w->>k)::int;
  if v is null or v<0 or v>100 then raise exception 'Cada peso debe estar entre 0 y 100'; end if;
  total:=total+v;
 end loop;
 if total<>100 then raise exception 'Los pesos deben sumar 100 (suman %)',total; end if;
 insert into public.lodging_bonus_config(company_id,business_unit_id,pool_amount,weights,survey_goal,survey_min_responses,housekeeping_goal,updated_by,updated_at)
 values(unit.company_id,unit.id,(payload->>'pool_amount')::numeric,
  jsonb_build_object('occupancy',(w->>'occupancy')::int,'revpar',(w->>'revpar')::int,'booking',(w->>'booking')::int,'survey',(w->>'survey')::int,'housekeeping',(w->>'housekeeping')::int,'order',(w->>'order')::int),
  (payload->>'survey_goal')::numeric,(payload->>'survey_min_responses')::int,(payload->>'housekeeping_goal')::numeric,auth.uid(),now())
 on conflict(business_unit_id) do update set pool_amount=excluded.pool_amount,weights=excluded.weights,survey_goal=excluded.survey_goal,
  survey_min_responses=excluded.survey_min_responses,housekeeping_goal=excluded.housekeeping_goal,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
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
 insert into public.lodging_bonus_results(company_id,business_unit_id,month,pool_amount,points,amount,gate_applied,detail,saved_by,saved_at)
 values(unit.company_id,unit.id,target_month,(payload->>'pool_amount')::numeric,(payload->>'points')::numeric,(payload->>'amount')::numeric,
  coalesce((payload->>'gate_applied')::boolean,false),coalesce(payload->'detail','{}'::jsonb),auth.uid(),now())
 on conflict(business_unit_id,month) do update set pool_amount=excluded.pool_amount,points=excluded.points,amount=excluded.amount,
  gate_applied=excluded.gate_applied,detail=excluded.detail,saved_by=excluded.saved_by,saved_at=excluded.saved_at;
end $$;
revoke execute on function public.lodging_save_bonus_result(uuid,date,jsonb) from public,anon;
grant execute on function public.lodging_save_bonus_result(uuid,date,jsonb) to authenticated;

-- Montos acordados por hostal.
insert into public.lodging_bonus_config(company_id,business_unit_id,pool_amount)
select u.company_id,u.id,v.amount
from public.business_units u join (values ('HOC',100000),('HOB',100000),('HU',60000)) as v(code,amount) on v.code=u.code
where u.deleted_at is null
on conflict(business_unit_id) do nothing;

commit;
