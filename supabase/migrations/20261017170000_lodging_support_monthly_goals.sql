begin;

-- Metas de reservas de noche del bono de apoyo como número fijo por mes en cada
-- hostal (Centro 10, Uruguay 10 y Cobija 6), en lugar de por día o por semana.
alter table public.lodging_support_bonus_config alter column goals set default '{"HOC":{"per_month":10},"HU":{"per_month":10},"HOB":{"per_month":6}}';
update public.lodging_support_bonus_config set goals='{"HOC":{"per_month":10},"HU":{"per_month":10},"HOB":{"per_month":6}}'::jsonb,updated_at=now();

create or replace function public.lodging_save_support_bonus_config(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; g jsonb:=payload->'goals'; k text; v numeric; pool numeric:=(payload->>'pool_amount')::numeric; uid uuid:=nullif(payload->>'support_user_id','')::uuid;
begin
 if not public.has_permission('kpis.bonus.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where code='HOC' and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if pool is null or pool<0 then raise exception 'El monto no puede ser negativo'; end if;
 foreach k in array array['HOC','HU','HOB'] loop
  v:=(g->k->>'per_month')::numeric;
  if v is null or v<0 or v>1000 then raise exception 'La meta de % debe ser un numero entre 0 y 1000',k; end if;
 end loop;
 if uid is not null and not exists(select 1 from public.profiles where id=uid and active and deleted_at is null) then raise exception 'Persona no valida'; end if;
 insert into public.lodging_support_bonus_config(company_id,support_user_id,pool_amount,goals,updated_by,updated_at)
 values(unit.company_id,uid,pool,jsonb_build_object(
   'HOC',jsonb_build_object('per_month',(g->'HOC'->>'per_month')::numeric),
   'HU',jsonb_build_object('per_month',(g->'HU'->>'per_month')::numeric),
   'HOB',jsonb_build_object('per_month',(g->'HOB'->>'per_month')::numeric)),auth.uid(),now())
 on conflict(company_id) do update set support_user_id=excluded.support_user_id,pool_amount=excluded.pool_amount,goals=excluded.goals,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke execute on function public.lodging_save_support_bonus_config(jsonb) from public,anon;
grant execute on function public.lodging_save_support_bonus_config(jsonb) to authenticated;

commit;
