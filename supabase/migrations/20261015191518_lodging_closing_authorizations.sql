begin;

-- Cierres de fechas anteriores con autorización. Recepción solo trabaja hoy y
-- ayer; para una fecha más antigua pide autorización con un motivo y la
-- aprueba o rechaza el administrador o gerencia. Una autorización aprobada
-- deja preparar, corregir y emitir el cierre de esa fecha en ese hostal
-- durante 48 horas. Todo queda en audit_logs.

insert into public.permissions(key,module,description) values
 ('lodging.closings.authorize','lodging','Autorizar a recepción el cierre diario de fechas anteriores')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.closings.authorize' and r.key in('administrator','general_manager','superadmin')
on conflict do nothing;

create table public.lodging_closing_authorizations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 closing_date date not null,
 reason text not null check(char_length(btrim(reason)) between 5 and 500),
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 requested_by uuid not null references public.profiles(id),
 requested_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 decision_notes text check(decision_notes is null or char_length(decision_notes)<=500),
 expires_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(status='pending' or (decided_by is not null and decided_at is not null)),
 check(status<>'approved' or expires_at is not null),
 check(status<>'rejected' or char_length(coalesce(btrim(decision_notes),''))>=3)
);
-- Una sola solicitud pendiente por hostal y fecha.
create unique index lodging_closing_authorizations_pending_idx on public.lodging_closing_authorizations(business_unit_id,closing_date) where status='pending';
create index lodging_closing_authorizations_unit_idx on public.lodging_closing_authorizations(company_id,business_unit_id,status,requested_at desc);
create index lodging_closing_authorizations_date_idx on public.lodging_closing_authorizations(business_unit_id,closing_date,status);
create trigger audit_lodging_closing_authorizations after insert or update or delete on public.lodging_closing_authorizations
 for each row execute function public.audit_row_change();

alter table public.lodging_closing_authorizations enable row level security;
create policy lodging_closing_authorizations_read on public.lodging_closing_authorizations for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id)
  and (public.has_permission('lodging.closings.create') or public.has_permission('lodging.closings.authorize')));
revoke all on public.lodging_closing_authorizations from public,anon,authenticated;
grant select on public.lodging_closing_authorizations to authenticated;
grant select,insert,update on public.lodging_closing_authorizations to service_role;

-- ¿Hay una autorización vigente para cerrar esa fecha en ese hostal? (uso interno)
create or replace function public.lodging_closing_date_authorized(target_unit uuid,target_date date) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lodging_closing_authorizations
  where business_unit_id=target_unit and closing_date=target_date and status='approved' and expires_at>now())
$$;
revoke execute on function public.lodging_closing_date_authorized(uuid,date) from public,anon,authenticated;

-- Solicitar autorización. Si quien la pide puede autorizar, queda aprobada al instante.
create or replace function public.lodging_closing_authorization_request(target_unit uuid,target_date date,request_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; v_id uuid; approver boolean; v_reason text:=btrim(coalesce(request_reason,''));
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 if me is null or not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 approver:=public.has_permission('lodging.closings.authorize');
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if target_date is null or target_date>=today-1 then raise exception 'Hoy y ayer se cierran sin autorizacion'; end if;
 if target_date<today-90 then raise exception 'Solo se pueden autorizar cierres de los ultimos 90 dias'; end if;
 if char_length(v_reason)<5 then raise exception 'Indica el motivo'; end if;
 if public.lodging_closing_date_authorized(unit.id,target_date) then raise exception 'Esa fecha ya esta autorizada'; end if;
 if exists(select 1 from public.lodging_closing_authorizations where business_unit_id=unit.id and closing_date=target_date and status='pending') then
  raise exception 'Ya hay una solicitud pendiente para esa fecha'; end if;
 insert into public.lodging_closing_authorizations(company_id,business_unit_id,closing_date,reason,status,requested_by,decided_by,decided_at,expires_at)
 values(unit.company_id,unit.id,target_date,v_reason,case when approver then 'approved' else 'pending' end,me,
  case when approver then me end,case when approver then now() end,case when approver then now()+interval '48 hours' end)
 returning id into v_id;
 if approver then return jsonb_build_object('id',v_id,'approved',true); end if;
 -- Aviso (y correo) a quienes pueden autorizar en el hostal.
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select unit.company_id,unit.id,p.id,'lodging.closing_authorization.review_assigned','Cierre de fecha anterior por autorizar',
  'Recepción de '||unit.name||' pide autorización para cerrar el '||to_char(target_date,'DD-MM-YYYY')||'. Motivo: '||left(v_reason,160),
  'lodging_closing_authorization',v_id,me
 from public.profiles p join public.user_business_units u on u.user_id=p.id and u.business_unit_id=unit.id
 where p.active and p.deleted_at is null and p.id<>me and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=p.role_id and k.key='lodging.closings.authorize' and k.active);
 return jsonb_build_object('id',v_id,'approved',false);
end $$;

-- Aprobar o rechazar (administrador o gerencia).
create or replace function public.lodging_closing_authorization_decide(target_request uuid,approve boolean,notes text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); a public.lodging_closing_authorizations; unit_name text;
begin
 if me is null or not public.has_permission('lodging.closings.authorize') then raise exception 'Sin autorizacion'; end if;
 select * into a from public.lodging_closing_authorizations where id=target_request for update;
 if a.id is null or not public.can_access_unit(a.company_id,a.business_unit_id) then raise exception 'Solicitud no encontrada'; end if;
 if a.status<>'pending' then raise exception 'La solicitud ya fue resuelta'; end if;
 if not approve and char_length(btrim(coalesce(notes,'')))<3 then raise exception 'Indica el motivo del rechazo'; end if;
 update public.lodging_closing_authorizations set status=case when approve then 'approved' else 'rejected' end,decided_by=me,decided_at=now(),
  decision_notes=nullif(btrim(coalesce(notes,'')),''),expires_at=case when approve then now()+interval '48 hours' end where id=a.id;
 select name into unit_name from public.business_units where id=a.business_unit_id;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 values(a.company_id,a.business_unit_id,a.requested_by,'lodging.closing_authorization.decided',
  case when approve then 'Cierre autorizado' else 'Cierre no autorizado' end,
  case when approve then 'Puedes hacer el cierre del '||to_char(a.closing_date,'DD-MM-YYYY')||' de '||unit_name||' durante las próximas 48 horas.'
   else 'No se autorizó el cierre del '||to_char(a.closing_date,'DD-MM-YYYY')||'. Motivo: '||left(btrim(notes),160) end,
  'lodging_closing_authorization',a.id,me);
end $$;

revoke execute on function public.lodging_closing_authorization_request(uuid,date,text),public.lodging_closing_authorization_decide(uuid,boolean,text) from public,anon;
grant execute on function public.lodging_closing_authorization_request(uuid,date,text),public.lodging_closing_authorization_decide(uuid,boolean,text) to authenticated;

-- ---------- Guardar: fechas antiguas con autorización vigente ----------
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
 if target_date<today-1 and not public.has_permission('lodging.closings.manage') and not public.lodging_closing_date_authorized(unit.id,target_date) then
  raise exception 'Para cerrar una fecha anterior a ayer necesitas autorizacion del administrador'; end if;
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

-- ---------- Emitir: mismo límite de fechas que al guardar ----------
create or replace function public.lodging_issue_daily_closing(target_closing uuid) returns void language plpgsql security definer set search_path='' as $function$
declare c public.lodging_daily_closings; today date:=(now() at time zone 'America/Santiago')::date;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status='issued' then raise exception 'El cierre ya fue emitido'; end if;
 if c.closing_date<today-1 and not public.has_permission('lodging.closings.manage') and not public.lodging_closing_date_authorized(c.business_unit_id,c.closing_date) then
  raise exception 'Para cerrar una fecha anterior a ayer necesitas autorizacion del administrador'; end if;
 perform public.lodging_apply_closing_snapshot(c.id);
 update public.lodging_daily_closings set status='issued',issued_at=now(),issued_by=auth.uid(),version=version+1,updated_by=auth.uid() where id=c.id;
end $function$;

commit;
