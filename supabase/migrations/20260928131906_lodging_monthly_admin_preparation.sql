begin;

-- Administración (el cargo de supervisor/administrador) prepara el cierre
-- mensual: lo inicia, carga ingresos, costos, inversiones y retiros, y
-- administra las categorías, pero no ve el informe completo (estado de
-- resultados, utilidad e indicadores), que es información de gerencia.
-- Gerencia ve el informe y cierra o reabre el mes.

insert into public.permissions(key,module,description) values
 ('lodging.monthly_closing.close','lodging','Cerrar y reabrir el cierre mensual gerencial')
on conflict(key) do update set description=excluded.description,active=true;
update public.permissions set description='Ver el informe completo del cierre mensual (estado de resultados, utilidad e indicadores)' where key='lodging.monthly_closing.view';
update public.permissions set description='Preparar el cierre mensual: iniciarlo, cargar sus líneas y administrar categorías' where key='lodging.monthly_closing.manage';

-- El informe completo queda solo para gerencia.
delete from public.role_permissions rp using public.roles r,public.permissions p
where rp.role_id=r.id and rp.permission_id=p.id and r.key='administrator' and p.key='lodging.monthly_closing.view';
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.monthly_closing.close' and r.key in('superadmin','general_manager')
on conflict do nothing;

-- Supervisor y administrador son un mismo cargo: el rol Administrador ya tiene
-- los permisos de supervisión (auditorías, vista multi-hostal); el rol
-- "Supervisor de hostales" deja de ofrecerse (no tiene usuarios activos).
update public.roles set active=false where key='lodging_supervisor'
 and not exists(select 1 from public.profiles pr where pr.role_id=roles.id and pr.active and pr.deleted_at is null);

create or replace function public.lodging_monthly_close(target_closing uuid,closing_notes text) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.close') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_monthly_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status<>'draft' then raise exception 'El mes ya esta cerrado'; end if;
 perform public.lodging_monthly_refresh_totals(c.id);
 update public.lodging_monthly_closings set status='closed',snapshot=public.lodging_monthly_summary_internal(c.business_unit_id,c.period),
  notes=nullif(btrim(closing_notes),''),closed_at=now(),closed_by=auth.uid(),updated_by=auth.uid()
 where id=c.id;
end $$;

create or replace function public.lodging_monthly_reopen(target_closing uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_monthly_closings;
begin
 if not public.has_permission('lodging.monthly_closing.close') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_monthly_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status<>'closed' then raise exception 'El mes no esta cerrado'; end if;
 if char_length(coalesce(btrim(reason),''))<3 then raise exception 'Indica el motivo de la reapertura'; end if;
 update public.lodging_monthly_closings set status='draft',reopened_at=now(),reopened_by=auth.uid(),reopen_reason=btrim(reason),updated_by=auth.uid() where id=c.id;
end $$;

-- Vista de preparación: estado del mes, líneas manuales, categorías y control
-- de cierres diarios emitidos, sin ventas, totales ni utilidad.
create or replace function public.lodging_monthly_preparation(target_unit uuid,target_period date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units; c public.lodging_monthly_closings; p date:=date_trunc('month',target_period)::date; today date:=(now() at time zone 'America/Santiago')::date;
begin
 if not public.has_permission('lodging.monthly_closing.manage') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 select * into c from public.lodging_monthly_closings where business_unit_id=unit.id and period=p;
 return jsonb_build_object(
  'closing',case when c.id is null then null else jsonb_build_object('id',c.id,'status',c.status,'closed_at',c.closed_at,'reopened_at',c.reopened_at,'reopen_reason',c.reopen_reason) end,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'category_id',l.category_id,'category',f.name,'section',f.section,'description',l.description,
     'amount',l.amount,'payer',l.payer,'payment_status',l.payment_status) order by f.section,f.name,l.created_at)
    from public.lodging_monthly_closing_lines l join public.lodging_finance_categories f on f.id=l.category_id
    where l.closing_id=c.id and l.deleted_at is null),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'section',f.section,'name',f.name,'sort_order',f.sort_order,'active',f.active) order by f.section,f.sort_order,f.name)
    from public.lodging_finance_categories f where f.business_unit_id=unit.id),'[]'::jsonb),
  'daily_closings',jsonb_build_object(
   'issued',(select count(*) from public.lodging_daily_closings d where d.business_unit_id=unit.id and d.status='issued' and d.closing_date>=p and d.closing_date<(p+interval '1 month')::date),
   'days',greatest(0,(least(today+1,(p+interval '1 month')::date)-p)))
 );
end $$;
revoke execute on function public.lodging_monthly_preparation(uuid,date) from public,anon;
grant execute on function public.lodging_monthly_preparation(uuid,date) to authenticated;

-- Las categorías también se leen al preparar el mes.
drop policy lodging_finance_categories_select on public.lodging_finance_categories;
create policy lodging_finance_categories_select on public.lodging_finance_categories for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (public.has_permission('lodging.monthly_closing.view') or public.has_permission('lodging.monthly_closing.manage') or public.has_permission('lodging.closings.create')));

commit;
