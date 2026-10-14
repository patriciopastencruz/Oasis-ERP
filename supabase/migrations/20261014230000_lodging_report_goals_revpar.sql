begin;

-- Meta de RevPAR propia por hostal. Vacía = venta promedio meta x ocupación
-- meta. Hostal Oasis Centro: $27.000.

alter table public.lodging_report_goals add column revpar numeric(12,0) check(revpar>=0);

create or replace function public.lodging_set_report_goals(target_unit uuid,goals jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; cats jsonb:='{}'::jsonb; k text; v numeric;
 occ numeric:=nullif(goals->>'occupancy_pct','')::numeric;
 adr numeric:=nullif(goals->>'average_rate','')::numeric;
 score numeric:=nullif(goals->>'booking_score','')::numeric;
 rp numeric:=nullif(goals->>'revpar','')::numeric;
begin
 if auth.uid() is null or not public.has_permission('lodging.goals.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if occ is not null and (occ<0 or occ>100) then raise exception 'La meta de ocupacion debe estar entre 0 y 100'; end if;
 if adr is not null and adr<0 then raise exception 'La meta de venta promedio no puede ser negativa'; end if;
 if rp is not null and rp<0 then raise exception 'La meta de RevPAR no puede ser negativa'; end if;
 if score is not null and (score<0 or score>10) then raise exception 'El puntaje meta debe estar entre 0 y 10'; end if;
 for k in select jsonb_object_keys(coalesce(goals->'booking_categories','{}'::jsonb)) loop
  if k not in('cleanliness','comfort','facilities','location','staff','value','wifi') then raise exception 'Area desconocida: %',k; end if;
  v:=nullif(goals->'booking_categories'->>k,'')::numeric;
  if v is null then continue; end if;
  if v<0 or v>10 then raise exception 'El puntaje meta por area debe estar entre 0 y 10'; end if;
  cats:=cats||jsonb_build_object(k,round(v,1));
 end loop;
 insert into public.lodging_report_goals(business_unit_id,company_id,occupancy_pct,average_rate,revpar,booking_score,booking_categories,updated_by)
 values(unit.id,unit.company_id,occ,round(adr),round(rp),round(score,1),cats,auth.uid())
 on conflict(business_unit_id) do update set occupancy_pct=excluded.occupancy_pct,average_rate=excluded.average_rate,revpar=excluded.revpar,
  booking_score=excluded.booking_score,booking_categories=excluded.booking_categories,updated_at=now(),updated_by=excluded.updated_by;
end $$;
revoke execute on function public.lodging_set_report_goals(uuid,jsonb) from public,anon;
grant execute on function public.lodging_set_report_goals(uuid,jsonb) to authenticated;

update public.lodging_report_goals g set revpar=27000
from public.business_units bu where bu.id=g.business_unit_id and bu.code='HOC';

commit;
