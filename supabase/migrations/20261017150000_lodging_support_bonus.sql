begin;

-- Bono de apoyo transversal (persona que trabaja de noche de lunes a viernes y
-- apoya a los 3 hostales): 70% el resultado conjunto de los hostales y 30% las
-- reservas que ella crea de noche en cada hostal, de forma proporcional.
-- La configuración (monto, persona y metas) y el resultado guardado de cada mes
-- viven aquí; las reservas y el resultado de los hostales salen de sus tablas.
create table public.lodging_support_bonus_config(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null unique references public.companies(id),
 support_user_id uuid references public.profiles(id),
 pool_amount numeric(14,0) not null default 0 check(pool_amount>=0),
 -- Metas de reservas nocturnas por hostal: por noche laborable (lunes a viernes) o por semana.
 goals jsonb not null default '{"HOC":{"per_day":1},"HU":{"per_day":1},"HOB":{"per_week":3}}',
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);

create table public.lodging_support_bonus_results(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 month date not null check(month=date_trunc('month',month)::date),
 support_user_id uuid references public.profiles(id),
 pool_amount numeric(14,0) not null,
 points numeric(5,2) not null,
 amount numeric(14,0) not null,
 detail jsonb not null default '{}'::jsonb,
 saved_by uuid references public.profiles(id),
 saved_at timestamptz not null default now(),
 unique(company_id,month)
);

create trigger audit_lodging_support_bonus_config after insert or update on public.lodging_support_bonus_config for each row execute function public.audit_row_change();
create trigger audit_lodging_support_bonus_results after insert or update on public.lodging_support_bonus_results for each row execute function public.audit_row_change();

alter table public.lodging_support_bonus_config enable row level security;
alter table public.lodging_support_bonus_results enable row level security;
create policy lodging_support_bonus_config_read on public.lodging_support_bonus_config for select to authenticated
 using(public.can_access_company(company_id) and public.has_permission('kpis.view'));
create policy lodging_support_bonus_results_read on public.lodging_support_bonus_results for select to authenticated
 using(public.can_access_company(company_id) and public.has_permission('kpis.view'));
revoke all on public.lodging_support_bonus_config,public.lodging_support_bonus_results from public,anon,authenticated;
grant select on public.lodging_support_bonus_config,public.lodging_support_bonus_results to authenticated;
grant select,insert,update on public.lodging_support_bonus_config,public.lodging_support_bonus_results to service_role;

-- Recepcionistas con acceso a hostales del usuario, para elegir a la persona de apoyo.
create or replace function public.lodging_support_candidates() returns table(id uuid,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 return query
  select p.id,trim(p.first_name||' '||p.last_name)
  from public.profiles p join public.roles ro on ro.id=p.role_id
  where p.active and p.deleted_at is null and ro.key='receptionist'
   and exists(select 1 from public.user_business_units ubu join public.business_units u on u.id=ubu.business_unit_id
    where ubu.user_id=p.id and u.code in('HU','HOC','HOB') and public.can_access_unit(u.company_id,u.id))
  order by 2;
end $$;
revoke execute on function public.lodging_support_candidates() from public,anon;
grant execute on function public.lodging_support_candidates() to authenticated;

-- Nombre de la persona de apoyo configurada, visible para quien ve los indicadores
-- (profiles solo deja ver el propio registro).
create or replace function public.lodging_support_person() returns table(id uuid,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('kpis.view') then raise exception 'Sin autorizacion'; end if;
 return query
  select p.id,trim(p.first_name||' '||p.last_name)
  from public.lodging_support_bonus_config c join public.profiles p on p.id=c.support_user_id
  where public.can_access_company(c.company_id);
end $$;
revoke execute on function public.lodging_support_person() from public,anon;
grant execute on function public.lodging_support_person() to authenticated;

create or replace function public.lodging_save_support_bonus_config(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; g jsonb:=payload->'goals'; k text; v numeric; pool numeric:=(payload->>'pool_amount')::numeric; uid uuid:=nullif(payload->>'support_user_id','')::uuid;
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where code='HOC' and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if pool is null or pool<0 then raise exception 'El monto no puede ser negativo'; end if;
 foreach k in array array['HOC','HU','HOB'] loop
  v:=coalesce((g->k->>'per_day')::numeric,(g->k->>'per_week')::numeric);
  if v is null or v<0 or v>1000 then raise exception 'La meta de % debe ser un numero entre 0 y 1000',k; end if;
 end loop;
 if uid is not null and not exists(select 1 from public.profiles where id=uid and active and deleted_at is null) then raise exception 'Persona no valida'; end if;
 insert into public.lodging_support_bonus_config(company_id,support_user_id,pool_amount,goals,updated_by,updated_at)
 values(unit.company_id,uid,pool,jsonb_build_object(
   'HOC',jsonb_build_object('per_day',(g->'HOC'->>'per_day')::numeric),
   'HU',jsonb_build_object('per_day',(g->'HU'->>'per_day')::numeric),
   'HOB',jsonb_build_object('per_week',(g->'HOB'->>'per_week')::numeric)),auth.uid(),now())
 on conflict(company_id) do update set support_user_id=excluded.support_user_id,pool_amount=excluded.pool_amount,goals=excluded.goals,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke execute on function public.lodging_save_support_bonus_config(jsonb) from public,anon;
grant execute on function public.lodging_save_support_bonus_config(jsonb) to authenticated;

create or replace function public.lodging_save_support_bonus_result(target_month date,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units;
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where code='HOC' and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if target_month<>date_trunc('month',target_month)::date then raise exception 'El mes debe ser el primer dia'; end if;
 if target_month>=date_trunc('month',(now() at time zone 'America/Santiago')::date)::date then raise exception 'Solo se guarda el resultado de un mes ya terminado'; end if;
 insert into public.lodging_support_bonus_results(company_id,month,support_user_id,pool_amount,points,amount,detail,saved_by,saved_at)
 values(unit.company_id,target_month,nullif(payload->>'support_user_id','')::uuid,(payload->>'pool_amount')::numeric,(payload->>'points')::numeric,(payload->>'amount')::numeric,
  coalesce(payload->'detail','{}'::jsonb),auth.uid(),now())
 on conflict(company_id,month) do update set support_user_id=excluded.support_user_id,pool_amount=excluded.pool_amount,points=excluded.points,amount=excluded.amount,
  detail=excluded.detail,saved_by=excluded.saved_by,saved_at=excluded.saved_at;
end $$;
revoke execute on function public.lodging_save_support_bonus_result(date,jsonb) from public,anon;
grant execute on function public.lodging_save_support_bonus_result(date,jsonb) to authenticated;

-- Configuración inicial: $100.000 y Alicia Pedraza como persona de apoyo.
insert into public.lodging_support_bonus_config(company_id,support_user_id,pool_amount)
select u.company_id,(select p.id from public.profiles p join public.roles ro on ro.id=p.role_id
  where ro.key='receptionist' and p.first_name ilike 'Alicia' and p.last_name ilike 'Pedraza' and p.active limit 1),100000
from public.business_units u where u.code='HOC' and u.deleted_at is null
on conflict(company_id) do nothing;

commit;
