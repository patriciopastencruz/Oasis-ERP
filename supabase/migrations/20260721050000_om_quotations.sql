begin;

-- Modulo de Cotizaciones para Oasis Modulares. Primer modulo de negocio
-- propio de la unidad OM (Inventario es compartido entre unidades).
-- Flujo: vendedor crea un borrador, lo envia a aprobacion (numero
-- correlativo se asigna recien al enviar, igual que Caja Chica, para no
-- dejar huecos por borradores abandonados), un aprobador decide, y si
-- se aprueba queda lista para que el vendedor la marque como entregada.
-- Si se rechaza vuelve al vendedor para editar y reenviar, conservando
-- el mismo numero.

insert into public.roles(key,name,description,is_system) values
  ('seller','Vendedor/a','Creacion y seguimiento de cotizaciones comerciales',true)
on conflict(key) do update set name=excluded.name,description=excluded.description,active=true;

insert into public.permissions(key,module,description) values
  ('sales.quotations.create','sales','Crear, editar y enviar cotizaciones propias'),
  ('sales.quotations.approve','sales','Aprobar o rechazar cotizaciones de la unidad')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='sales.quotations.create'
where r.key='seller' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('operations_manager','general_manager') and p.key='sales.quotations.approve'
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='superadmin' and p.key like 'sales.quotations.%'
on conflict do nothing;

create table public.om_quotation_sequences(
 business_unit_id uuid not null references public.business_units(id) on delete cascade,year smallint not null,last_value bigint not null default 0,
 primary key(business_unit_id,year)
);

create table public.om_quotations(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 quotation_number text,sequence_year smallint,sequence_value bigint,
 client_company text not null,client_rut text,client_contact text,client_email text,client_place text,
 status text not null default 'draft' check(status in('draft','pending','approved','rejected','delivered')),
 discount numeric(14,2) not null default 0 check(discount>=0),
 subtotal numeric(14,2) not null default 0,net numeric(14,2) not null default 0,iva numeric(14,2) not null default 0,total numeric(14,2) not null default 0,
 terms text,
 submitted_at timestamptz,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,resolution_comment text,
 delivered_at timestamptz,delivered_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(company_id,quotation_number)
);

create table public.om_quotation_lines(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 quotation_id uuid not null references public.om_quotations(id) on delete cascade,
 position integer not null,description text not null,quantity numeric(14,2) not null check(quantity>0),unit_price numeric(14,2) not null check(unit_price>=0),line_total numeric(14,2) not null,
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_quotation_lines_quotation_idx on public.om_quotation_lines(quotation_id,position);

create or replace function public.om_next_quotation_sequence(target_unit uuid,target_year smallint) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 insert into public.om_quotation_sequences(business_unit_id,year,last_value) values(target_unit,target_year,1)
 on conflict(business_unit_id,year) do update set last_value=public.om_quotation_sequences.last_value+1 returning last_value into result;
 return result;
end $$;

create or replace function public.om_create_quotation(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); unit record; qid uuid:=gen_random_uuid(); line jsonb; pos int:=0; subtotal_value numeric:=0; discount_value numeric:=coalesce((payload->>'discount')::numeric,0);
begin
 if not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 select bu.id,bu.company_id into strict unit from public.business_units bu where bu.code='OM' and bu.active and bu.deleted_at is null;
 if not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if nullif(trim(payload->>'client_company'),'') is null then raise exception 'El cliente requiere una empresa'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb))=0 then raise exception 'La cotizacion requiere items'; end if;
 for line in select * from jsonb_array_elements(payload->'lines') loop
  if (line->>'quantity')::numeric<=0 or (line->>'unit_price')::numeric<0 then raise exception 'Item invalido'; end if;
  if nullif(trim(line->>'description'),'') is null then raise exception 'Item sin descripcion'; end if;
  subtotal_value:=subtotal_value+round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2);
 end loop;
 if discount_value<0 or discount_value>subtotal_value then raise exception 'Descuento invalido'; end if;
 insert into public.om_quotations(id,company_id,business_unit_id,client_company,client_rut,client_contact,client_email,client_place,discount,subtotal,net,iva,total,terms,created_by)
 values(qid,unit.company_id,unit.id,trim(payload->>'client_company'),nullif(trim(payload->>'client_rut'),''),nullif(trim(payload->>'client_contact'),''),nullif(trim(payload->>'client_email'),''),nullif(trim(payload->>'client_place'),''),
   discount_value,subtotal_value,subtotal_value-discount_value,round((subtotal_value-discount_value)*0.19,2),subtotal_value-discount_value+round((subtotal_value-discount_value)*0.19,2),nullif(trim(payload->>'terms'),''),me);
 for line in select * from jsonb_array_elements(payload->'lines') loop
  pos:=pos+1;
  insert into public.om_quotation_lines(company_id,business_unit_id,quotation_id,position,description,quantity,unit_price,line_total)
  values(unit.company_id,unit.id,qid,pos,trim(line->>'description'),(line->>'quantity')::numeric,(line->>'unit_price')::numeric,round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2));
 end loop;
 return qid;
end $$;

create or replace function public.om_update_quotation(target_quotation uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations; line jsonb; pos int:=0; subtotal_value numeric:=0; discount_value numeric:=coalesce((payload->>'discount')::numeric,0);
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected') then raise exception 'La cotizacion ya no admite ediciones'; end if;
 if nullif(trim(payload->>'client_company'),'') is null then raise exception 'El cliente requiere una empresa'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb))=0 then raise exception 'La cotizacion requiere items'; end if;
 for line in select * from jsonb_array_elements(payload->'lines') loop
  if (line->>'quantity')::numeric<=0 or (line->>'unit_price')::numeric<0 then raise exception 'Item invalido'; end if;
  if nullif(trim(line->>'description'),'') is null then raise exception 'Item sin descripcion'; end if;
  subtotal_value:=subtotal_value+round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2);
 end loop;
 if discount_value<0 or discount_value>subtotal_value then raise exception 'Descuento invalido'; end if;
 delete from public.om_quotation_lines where quotation_id=q.id;
 for line in select * from jsonb_array_elements(payload->'lines') loop
  pos:=pos+1;
  insert into public.om_quotation_lines(company_id,business_unit_id,quotation_id,position,description,quantity,unit_price,line_total)
  values(q.company_id,q.business_unit_id,q.id,pos,trim(line->>'description'),(line->>'quantity')::numeric,(line->>'unit_price')::numeric,round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2));
 end loop;
 update public.om_quotations set
   client_company=trim(payload->>'client_company'),client_rut=nullif(trim(payload->>'client_rut'),''),client_contact=nullif(trim(payload->>'client_contact'),''),
   client_email=nullif(trim(payload->>'client_email'),''),client_place=nullif(trim(payload->>'client_place'),''),
   discount=discount_value,subtotal=subtotal_value,net=subtotal_value-discount_value,iva=round((subtotal_value-discount_value)*0.19,2),
   total=subtotal_value-discount_value+round((subtotal_value-discount_value)*0.19,2),terms=nullif(trim(payload->>'terms'),''),updated_by=me,updated_at=now()
 where id=q.id;
end $$;

create or replace function public.om_submit_quotation(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations; yr smallint; seq bigint;
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected') then raise exception 'La cotizacion ya fue enviada'; end if;
 if not exists(select 1 from public.om_quotation_lines where quotation_id=q.id) then raise exception 'La cotizacion requiere items'; end if;
 if q.quotation_number is null then
  yr:=extract(year from now() at time zone 'America/Santiago')::smallint;
  seq:=public.om_next_quotation_sequence(q.business_unit_id,yr);
  update public.om_quotations set quotation_number=format('COT-%s-%s',yr,lpad(seq::text,6,'0')),sequence_year=yr,sequence_value=seq,
    status='pending',submitted_at=now(),reviewed_by=null,reviewed_at=null,resolution_comment=null,updated_by=me,updated_at=now() where id=q.id;
 else
  update public.om_quotations set status='pending',submitted_at=now(),reviewed_by=null,reviewed_at=null,resolution_comment=null,updated_by=me,updated_at=now() where id=q.id;
 end if;
end $$;

create or replace function public.om_review_quotation(target_quotation uuid,decision text,comment_text text) returns void language plpgsql security invoker set search_path='' as $$
declare q public.om_quotations;
begin
 if not public.has_permission('sales.quotations.approve') or decision not in('approved','rejected') then raise exception 'Sin autorizacion'; end if;
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if not public.can_access_unit(q.company_id,q.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if q.status<>'pending' then raise exception 'Cotizacion ya resuelta'; end if;
 update public.om_quotations set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),resolution_comment=comment_text,updated_by=auth.uid(),updated_at=now() where id=q.id;
end $$;

create or replace function public.om_mark_quotation_delivered(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations;
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status<>'approved' then raise exception 'La cotizacion debe estar aprobada'; end if;
 update public.om_quotations set status='delivered',delivered_at=now(),delivered_by=me,updated_by=me,updated_at=now() where id=q.id;
end $$;

create or replace function public.om_notify_quotation_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status=old.status then return new; end if;
 if new.status='pending' then
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  select new.company_id,new.business_unit_id,p.id,'om_quotation.approval_pending','Cotizacion pendiente de aprobacion',
    'La cotizacion '||coalesce(new.quotation_number,'(sin numero)')||' de '||new.client_company||' requiere tu revision.',
    'om_quotation',new.id,new.created_by
  from public.profiles p
  join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=new.company_id and ubu.business_unit_id=new.business_unit_id
  where p.active and p.deleted_at is null
   and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=p.role_id and perm.key='sales.quotations.approve' and perm.active)
   and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='om_quotation' and n.entity_id=new.id and n.event_key='om_quotation.approval_pending' and n.status='unread');
 elsif new.status in('approved','rejected') then
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  values(new.company_id,new.business_unit_id,new.created_by,
   'om_quotation.'||new.status,
   case when new.status='approved' then 'Cotizacion aprobada' else 'Cotizacion rechazada' end,
   'La cotizacion '||coalesce(new.quotation_number,'(sin numero)')||' de '||new.client_company||
     case when new.status='rejected' and coalesce(new.resolution_comment,'')<>'' then ': '||new.resolution_comment else '' end,
   'om_quotation',new.id,coalesce(new.reviewed_by,new.created_by));
 end if;
 return new;
end $$;
create trigger om_quotations_notify after update of status on public.om_quotations for each row execute function public.om_notify_quotation_event();

alter table public.om_quotation_sequences enable row level security;
alter table public.om_quotations enable row level security;
alter table public.om_quotation_lines enable row level security;

create policy om_quotations_read on public.om_quotations for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (created_by=(select auth.uid()) or public.has_permission('sales.quotations.approve')));
create policy om_quotations_insert on public.om_quotations for insert to authenticated with check(created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'));
create policy om_quotations_update on public.om_quotations for update to authenticated using(public.can_access_unit(company_id,business_unit_id) and ((created_by=(select auth.uid()) and public.has_permission('sales.quotations.create')) or public.has_permission('sales.quotations.approve'))) with check(public.can_access_unit(company_id,business_unit_id));
create policy om_quotation_lines_read on public.om_quotation_lines for select to authenticated using(exists(select 1 from public.om_quotations q where q.id=quotation_id));
create policy om_quotation_lines_insert on public.om_quotation_lines for insert to authenticated with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'));
create policy om_quotation_lines_delete on public.om_quotation_lines for delete to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'));

revoke all on public.om_quotation_sequences from authenticated;
grant select,insert,update on public.om_quotations to authenticated,service_role;
grant select,insert,update,delete on public.om_quotation_lines to authenticated,service_role;
grant select,insert,update on public.om_quotation_sequences to service_role;
grant execute on function public.om_create_quotation(jsonb),public.om_update_quotation(uuid,jsonb),public.om_submit_quotation(uuid),public.om_review_quotation(uuid,text,text),public.om_mark_quotation_delivered(uuid) to authenticated;
revoke execute on function public.om_next_quotation_sequence(uuid,smallint) from public,anon;
grant execute on function public.om_next_quotation_sequence(uuid,smallint) to authenticated;

commit;
