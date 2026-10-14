begin;

-- Metas por hostal para el reporte semanal: ocupación del mes, venta promedio
-- por habitación (ADR), puntaje de Booking y puntaje por área. La meta de
-- RevPAR no se guarda: es ADR meta × ocupación meta. Las fija gerencia.

create table public.lodging_report_goals(
 business_unit_id uuid primary key,
 company_id uuid not null references public.companies(id),
 occupancy_pct numeric(5,2) check(occupancy_pct between 0 and 100),
 average_rate numeric(12,0) check(average_rate>=0),
 booking_score numeric(3,1) check(booking_score between 0 and 10),
 booking_categories jsonb not null default '{}'::jsonb check(jsonb_typeof(booking_categories)='object'),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create trigger audit_lodging_report_goals after insert or update or delete on public.lodging_report_goals for each row execute function public.audit_row_change();

alter table public.lodging_report_goals enable row level security;
create policy lodging_report_goals_select on public.lodging_report_goals for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id));
revoke all on public.lodging_report_goals from public,anon,authenticated;
grant select on public.lodging_report_goals to authenticated;
grant select,insert,update on public.lodging_report_goals to service_role;

insert into public.permissions(key,module,description) values
 ('lodging.goals.manage','lodging','Fijar las metas de ocupación, venta y puntaje de cada hostal')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.goals.manage' and r.key in('general_manager','superadmin')
on conflict do nothing;

-- Guarda las metas de un hostal. Valores vacíos = sin meta.
create or replace function public.lodging_set_report_goals(target_unit uuid,goals jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; cats jsonb:='{}'::jsonb; k text; v numeric;
 occ numeric:=nullif(goals->>'occupancy_pct','')::numeric;
 adr numeric:=nullif(goals->>'average_rate','')::numeric;
 score numeric:=nullif(goals->>'booking_score','')::numeric;
begin
 if auth.uid() is null or not public.has_permission('lodging.goals.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if occ is not null and (occ<0 or occ>100) then raise exception 'La meta de ocupacion debe estar entre 0 y 100'; end if;
 if adr is not null and adr<0 then raise exception 'La meta de venta promedio no puede ser negativa'; end if;
 if score is not null and (score<0 or score>10) then raise exception 'El puntaje meta debe estar entre 0 y 10'; end if;
 for k in select jsonb_object_keys(coalesce(goals->'booking_categories','{}'::jsonb)) loop
  if k not in('cleanliness','comfort','facilities','location','staff','value','wifi') then raise exception 'Area desconocida: %',k; end if;
  v:=nullif(goals->'booking_categories'->>k,'')::numeric;
  if v is null then continue; end if;
  if v<0 or v>10 then raise exception 'El puntaje meta por area debe estar entre 0 y 10'; end if;
  cats:=cats||jsonb_build_object(k,round(v,1));
 end loop;
 insert into public.lodging_report_goals(business_unit_id,company_id,occupancy_pct,average_rate,booking_score,booking_categories,updated_by)
 values(unit.id,unit.company_id,occ,round(adr),round(score,1),cats,auth.uid())
 on conflict(business_unit_id) do update set occupancy_pct=excluded.occupancy_pct,average_rate=excluded.average_rate,
  booking_score=excluded.booking_score,booking_categories=excluded.booking_categories,updated_at=now(),updated_by=excluded.updated_by;
end $$;
revoke execute on function public.lodging_set_report_goals(uuid,jsonb) from public,anon;
grant execute on function public.lodging_set_report_goals(uuid,jsonb) to authenticated;

-- Metas iniciales pedidas por gerencia.
insert into public.lodging_report_goals(business_unit_id,company_id,occupancy_pct,average_rate,booking_score,booking_categories)
select bu.id,bu.company_id,g.occ,g.adr,g.score,g.cats from public.business_units bu
join (values
 ('HU',80::numeric,26000::numeric,8.0::numeric,'{"cleanliness":8,"staff":8,"wifi":7}'::jsonb),
 ('HOC',90,27000,7.5,'{"cleanliness":8,"staff":8}'::jsonb),
 ('HOB',90,30000,7.5,'{"cleanliness":8,"staff":8}'::jsonb)
) as g(code,occ,adr,score,cats) on g.code=bu.code
where bu.deleted_at is null
on conflict(business_unit_id) do nothing;

commit;
