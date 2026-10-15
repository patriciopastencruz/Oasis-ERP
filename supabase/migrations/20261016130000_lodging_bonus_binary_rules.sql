begin;

-- Reglas más exigentes del bono de recepción:
--  * la venta promedio por habitación reemplaza al RevPAR como indicador de venta;
--  * el aseo se mide por inspección completa y a tiempo (cumple o no cumple);
--  * el orden administrativo mide cierres diarios a tiempo y saldos pendientes.

-- Primera emisión de cada cierre: `issued_at` se sobrescribe al reemitir, y para
-- saber si el cierre estuvo al día importa la primera vez que se emitió.
alter table public.lodging_daily_closings add column first_issued_at timestamptz;

alter table public.lodging_daily_closings disable trigger audit_lodging_daily_closings;
alter table public.lodging_daily_closings disable trigger lodging_daily_closings_updated_at;
update public.lodging_daily_closings c set first_issued_at=coalesce(
 (select min(a.created_at) from public.audit_logs a where a.entity_id=c.id and a.new_data->>'status'='issued'),
 c.issued_at)
where c.status='issued' and c.first_issued_at is null;
alter table public.lodging_daily_closings enable trigger audit_lodging_daily_closings;
alter table public.lodging_daily_closings enable trigger lodging_daily_closings_updated_at;

create or replace function public.lodging_issue_daily_closing(target_closing uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_daily_closings; today date:=(now() at time zone 'America/Santiago')::date;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status='issued' then raise exception 'El cierre ya fue emitido'; end if;
 if c.closing_date<today-1 and not public.has_permission('lodging.closings.manage') and not public.lodging_closing_date_authorized(c.business_unit_id,c.closing_date) then
  raise exception 'Para cerrar una fecha anterior a ayer necesitas autorizacion del administrador'; end if;
 perform public.lodging_apply_closing_snapshot(c.id);
 update public.lodging_daily_closings set status='issued',issued_at=now(),first_issued_at=coalesce(first_issued_at,now()),issued_by=auth.uid(),version=version+1,updated_by=auth.uid() where id=c.id;
end $$;

-- Configuración del bono: nuevas claves de peso y tiempo máximo de inspección.
alter table public.lodging_bonus_config drop column housekeeping_goal;
alter table public.lodging_bonus_config add column inspection_max_wait_minutes integer not null default 60 check(inspection_max_wait_minutes between 1 and 1440);
alter table public.lodging_bonus_config alter column weights set default '{"occupancy":25,"adr":25,"booking":20,"survey":10,"inspections":5,"order":15}';
update public.lodging_bonus_config set weights=jsonb_build_object(
 'occupancy',weights->'occupancy','adr',weights->'revpar','booking',weights->'booking',
 'survey',weights->'survey','inspections',weights->'housekeeping','order',weights->'order');

create or replace function public.lodging_save_bonus_config(target_unit uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; w jsonb:=payload->'weights'; k text; total int:=0; v int; wait int:=(payload->>'inspection_max_wait_minutes')::int;
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
 insert into public.lodging_bonus_config(company_id,business_unit_id,pool_amount,weights,survey_goal,survey_min_responses,inspection_max_wait_minutes,updated_by,updated_at)
 values(unit.company_id,unit.id,(payload->>'pool_amount')::numeric,
  jsonb_build_object('occupancy',(w->>'occupancy')::int,'adr',(w->>'adr')::int,'booking',(w->>'booking')::int,'survey',(w->>'survey')::int,'inspections',(w->>'inspections')::int,'order',(w->>'order')::int),
  (payload->>'survey_goal')::numeric,(payload->>'survey_min_responses')::int,wait,auth.uid(),now())
 on conflict(business_unit_id) do update set pool_amount=excluded.pool_amount,weights=excluded.weights,survey_goal=excluded.survey_goal,
  survey_min_responses=excluded.survey_min_responses,inspection_max_wait_minutes=excluded.inspection_max_wait_minutes,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke execute on function public.lodging_save_bonus_config(uuid,jsonb) from public,anon;
grant execute on function public.lodging_save_bonus_config(uuid,jsonb) to authenticated;

-- Metas de venta promedio por habitación: Centro 30.000 y Cobija 32.000.
-- (La meta de RevPAR de Cobija, que se deriva de venta promedio × ocupación, sube con ella.)
update public.lodging_report_goals g set average_rate=v.rate,updated_at=now()
from public.business_units u join (values ('HOC',30000),('HOB',32000)) as v(code,rate) on v.code=u.code
where g.business_unit_id=u.id;

commit;
