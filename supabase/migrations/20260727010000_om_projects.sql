begin;

-- Modulo de Proyectos para Oasis Modulares. Convierte una cotizacion
-- aceptada (om_quotations) en un proyecto con seguimiento basico, gastos
-- propios y estado de resultados. Primer caso en el repo de una entidad
-- que se convierte en otra: la cotizacion se conserva intacta como
-- documento comercial/historico (nunca se reemplaza ni se borra), y el
-- proyecto guarda una fotografia (snapshot) de los datos comerciales
-- relevantes en el momento de la conversion -- cliente, vendedor, monto
-- neto/IVA/total -- para que cambios posteriores en la cotizacion no
-- alteren silenciosamente el resultado historico. quotation_id queda
-- como referencia de navegacion, nunca se usa en los calculos.
-- A diferencia de cotizaciones (que asignan el correlativo recien al
-- enviar, para no dejar huecos por borradores abandonados), un proyecto
-- no tiene concepto de borrador: el numero PRY-OM-<anio>-<secuencia> se
-- asigna de inmediato al crearlo, ya sea manual o por conversion.

insert into public.permissions(key,module,description) values
 ('sales.projects.view','sales','Ver proyectos de Oasis Modulares'),
 ('sales.projects.create','sales','Crear proyectos manualmente'),
 ('sales.projects.update','sales','Editar datos generales y avanzar el estado de un proyecto'),
 ('sales.projects.convert_from_quotation','sales','Convertir una cotizacion aceptada en proyecto'),
 ('sales.projects.manage_team','sales','Asignar responsable y equipo del proyecto'),
 ('sales.projects.manage_expenses','sales','Registrar, editar y anular gastos del proyecto'),
 ('sales.projects.manage_documents','sales','Subir y eliminar documentos del proyecto'),
 ('sales.projects.add_notes','sales','Registrar observaciones en la bitacora del proyecto'),
 ('sales.projects.close','sales','Cerrar un proyecto'),
 ('sales.projects.reopen','sales','Reabrir un proyecto cerrado'),
 ('sales.projects.cancel','sales','Cancelar un proyecto')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='seller' and p.key in(
 'sales.projects.create','sales.projects.update','sales.projects.convert_from_quotation',
 'sales.projects.manage_team','sales.projects.manage_expenses','sales.projects.manage_documents','sales.projects.add_notes'
) on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in('operations_manager','general_manager') and p.key in(
 'sales.projects.view','sales.projects.close','sales.projects.reopen','sales.projects.cancel'
) on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='superadmin' and p.key like 'sales.projects.%'
on conflict do nothing;

create table public.om_project_sequences(
 business_unit_id uuid not null references public.business_units(id) on delete cascade,year smallint not null,last_value bigint not null default 0,
 primary key(business_unit_id,year)
);

create table public.om_projects(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),business_unit_id uuid not null,
 project_number text,sequence_year smallint,sequence_value bigint,
 name text not null,description text,
 status text not null default 'pending' check(status in('pending','manufacturing','installation','done','cancelled')),
 quotation_id uuid references public.om_quotations(id),
 client_company text not null,client_rut text,client_contact text,client_email text,client_place text,
 execution_address text,
 seller_id uuid references public.profiles(id),
 responsible_id uuid not null references public.profiles(id),
 net_income numeric(14,2) not null default 0 check(net_income>=0),
 iva_reference numeric(14,2) not null default 0 check(iva_reference>=0),
 total_commercial numeric(14,2) not null default 0 check(total_commercial>=0),
 estimated_start_date date,actual_start_date date,estimated_end_date date,actual_end_date date,
 closed_at timestamptz,closed_by uuid references public.profiles(id),closure_notes text,
 cancelled_at timestamptz,cancelled_by uuid references public.profiles(id),cancellation_reason text,
 notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(company_id,project_number),
 unique(quotation_id),
 check(estimated_end_date is null or estimated_start_date is null or estimated_end_date>=estimated_start_date),
 check(actual_end_date is null or actual_start_date is null or actual_end_date>=actual_start_date),
 check(status<>'cancelled' or cancellation_reason is not null),
 check(status<>'done' or closed_at is not null)
);
create index om_projects_unit_idx on public.om_projects(company_id,business_unit_id) where deleted_at is null;
create index om_projects_status_idx on public.om_projects(status);
create index om_projects_responsible_idx on public.om_projects(responsible_id);

create table public.om_project_members(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id) on delete cascade,
 member_type text not null check(member_type in('user','external')),
 profile_id uuid references public.profiles(id),
 external_name text,
 role text not null check(role in('jefe_proyecto','vendedor','supervisor','instalador','trabajador','colaborador_externo')),
 note text,
 created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check((member_type='user' and profile_id is not null and external_name is null) or (member_type='external' and external_name is not null and profile_id is null))
);
create index om_project_members_project_idx on public.om_project_members(project_id);

create table public.om_project_expenses(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id) on delete cascade,
 expense_date date not null default current_date,
 category text not null check(category in('materiales','mano_de_obra','transporte','instalacion','alimentacion','alojamiento','subcontratos','herramientas','combustible','otros')),
 description text not null,
 supplier_name text,supplier_rut text,
 document_type text not null check(document_type in('boleta','factura','boleta_honorarios','guia_despacho','factura_exenta','sin_documento','otro')),
 document_number text,
 is_exempt boolean not null default false,
 net_amount numeric(14,2) not null check(net_amount>=0),
 iva_amount numeric(14,2) not null default 0 check(iva_amount>=0),
 total_amount numeric(14,2) not null default 0 check(total_amount>=0),
 payment_method text,
 notes text,
 status text not null default 'active' check(status in('active','voided')),
 voided_at timestamptz,voided_by uuid references public.profiles(id),void_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(status<>'voided' or (voided_at is not null and void_reason is not null))
);
create index om_project_expenses_project_idx on public.om_project_expenses(project_id,expense_date desc);
create index om_project_expenses_category_idx on public.om_project_expenses(project_id,category);

create table public.om_project_expense_attachments(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,business_unit_id uuid not null,
 expense_id uuid not null references public.om_project_expenses(id) on delete cascade,
 object_path text not null,original_name text not null,mime_type text not null,size_bytes bigint not null check(size_bytes>0),
 created_at timestamptz not null default now(),uploaded_by uuid not null references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_project_expense_attachments_expense_idx on public.om_project_expense_attachments(expense_id);

create table public.om_project_documents(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id) on delete cascade,
 document_type text not null check(document_type in('contrato','orden_compra_cliente','factura','recepcion_conforme','fotografia','plano','otro')),
 name text not null,object_path text not null,mime_type text not null,size_bytes bigint not null check(size_bytes>0),
 description text,
 created_at timestamptz not null default now(),uploaded_by uuid not null references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_project_documents_project_idx on public.om_project_documents(project_id);

create table public.om_project_notes(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id) on delete cascade,
 body text not null check(length(trim(body))>0),
 created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 edited_at timestamptz,deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_project_notes_project_idx on public.om_project_notes(project_id,created_at desc);

create table public.om_project_status_history(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id) on delete cascade,
 from_status text,to_status text not null,
 changed_by uuid not null references public.profiles(id),changed_at timestamptz not null default now(),
 comment text,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_project_status_history_project_idx on public.om_project_status_history(project_id,changed_at desc);

-- Calculo de neto/IVA/total en servidor: nunca se confia en lo que
-- mande el navegador. IVA fijo 19% salvo documento exento.
create or replace function public.om_calc_project_expense_totals() returns trigger language plpgsql set search_path='' as $$
begin
 new.iva_amount:=case when new.is_exempt then 0 else round(new.net_amount*0.19,2) end;
 new.total_amount:=new.net_amount+new.iva_amount;
 return new;
end $$;
create trigger om_project_expenses_calc_totals before insert or update of net_amount,is_exempt on public.om_project_expenses for each row execute function public.om_calc_project_expense_totals();

create trigger audit_om_projects after insert or update or delete on public.om_projects for each row execute function public.audit_row_change();
create trigger audit_om_project_members after insert or delete on public.om_project_members for each row execute function public.audit_row_change();
create trigger audit_om_project_expenses after insert or update on public.om_project_expenses for each row execute function public.audit_row_change();
create trigger audit_om_project_expense_attachments after insert or delete on public.om_project_expense_attachments for each row execute function public.audit_row_change();
create trigger audit_om_project_documents after insert or delete on public.om_project_documents for each row execute function public.audit_row_change();
create trigger audit_om_project_notes after insert or update on public.om_project_notes for each row execute function public.audit_row_change();
create trigger audit_om_project_status_history after insert on public.om_project_status_history for each row execute function public.audit_row_change();

create or replace function public.om_next_project_sequence(target_unit uuid,target_year smallint) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 insert into public.om_project_sequences(business_unit_id,year,last_value) values(target_unit,target_year,1)
 on conflict(business_unit_id,year) do update set last_value=public.om_project_sequences.last_value+1 returning last_value into result;
 return result;
end $$;

-- Compartida por creacion manual y conversion: el numero se asigna de
-- inmediato (no hay borrador en proyectos), pero queda factorizada aqui
-- para no duplicar la logica en las dos funciones que crean proyectos.
create or replace function public.om_assign_project_number(target_project uuid) returns void language plpgsql security invoker set search_path='' as $$
declare p public.om_projects; yr smallint; seq bigint;
begin
 select * into strict p from public.om_projects where id=target_project for update;
 if p.project_number is not null then return; end if;
 yr:=extract(year from now() at time zone 'America/Santiago')::smallint;
 seq:=public.om_next_project_sequence(p.business_unit_id,yr);
 update public.om_projects set project_number=format('PRY-OM-%s-%s',yr,lpad(seq::text,6,'0')),sequence_year=yr,sequence_value=seq where id=p.id;
end $$;

create or replace function public.om_create_project(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); unit record; pid uuid:=gen_random_uuid(); responsible uuid;
begin
 if not public.has_permission('sales.projects.create') then raise exception 'Sin autorizacion'; end if;
 select bu.id,bu.company_id into strict unit from public.business_units bu where bu.code='OM' and bu.active and bu.deleted_at is null;
 if not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'El proyecto requiere un nombre'; end if;
 if nullif(trim(payload->>'client_company'),'') is null then raise exception 'El proyecto requiere un cliente'; end if;
 responsible:=nullif(payload->>'responsible_id','')::uuid;
 if responsible is null then raise exception 'El proyecto requiere un responsable'; end if;
 if not exists(select 1 from public.user_business_units ubu where ubu.user_id=responsible and ubu.company_id=unit.company_id and ubu.business_unit_id=unit.id) then
   raise exception 'El responsable no pertenece a la unidad';
 end if;
 insert into public.om_projects(id,company_id,business_unit_id,name,description,client_company,client_rut,client_contact,client_email,client_place,
   execution_address,responsible_id,net_income,estimated_start_date,estimated_end_date,notes,created_by)
 values(pid,unit.company_id,unit.id,trim(payload->>'name'),nullif(trim(payload->>'description'),''),
   trim(payload->>'client_company'),nullif(trim(payload->>'client_rut'),''),nullif(trim(payload->>'client_contact'),''),
   nullif(trim(payload->>'client_email'),''),nullif(trim(payload->>'client_place'),''),nullif(trim(payload->>'execution_address'),''),
   responsible,coalesce((payload->>'net_income')::numeric,0),
   nullif(payload->>'estimated_start_date','')::date,nullif(payload->>'estimated_end_date','')::date,
   nullif(trim(payload->>'notes'),''),me);
 perform public.om_assign_project_number(pid);
 insert into public.om_project_status_history(company_id,business_unit_id,project_id,from_status,to_status,changed_by,comment)
 values(unit.company_id,unit.id,pid,null,'pending',me,'Proyecto creado manualmente');
 return pid;
end $$;

create or replace function public.om_convert_quotation_to_project(target_quotation uuid,payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations; pid uuid:=gen_random_uuid(); responsible uuid;
begin
 if not public.has_permission('sales.projects.convert_from_quotation') then raise exception 'Sin autorizacion'; end if;
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if not public.can_access_unit(q.company_id,q.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if q.status not in('approved','delivered') then raise exception 'La cotizacion debe estar aprobada o entregada'; end if;
 if exists(select 1 from public.om_projects where quotation_id=q.id) then raise exception 'Esta cotizacion ya tiene un proyecto asociado'; end if;
 responsible:=nullif(payload->>'responsible_id','')::uuid;
 if responsible is null then raise exception 'El proyecto requiere un responsable'; end if;
 if not exists(select 1 from public.user_business_units ubu where ubu.user_id=responsible and ubu.company_id=q.company_id and ubu.business_unit_id=q.business_unit_id) then
   raise exception 'El responsable no pertenece a la unidad';
 end if;
 insert into public.om_projects(id,company_id,business_unit_id,name,description,quotation_id,client_company,client_rut,client_contact,client_email,client_place,
   execution_address,seller_id,responsible_id,net_income,iva_reference,total_commercial,estimated_start_date,estimated_end_date,notes,created_by)
 values(pid,q.company_id,q.business_unit_id,coalesce(nullif(trim(payload->>'name'),''),'Proyecto '||q.client_company),nullif(trim(payload->>'description'),''),
   q.id,q.client_company,q.client_rut,q.client_contact,q.client_email,q.client_place,
   coalesce(nullif(trim(payload->>'execution_address'),''),q.client_place),q.created_by,responsible,
   q.net,q.iva,q.total,
   nullif(payload->>'estimated_start_date','')::date,nullif(payload->>'estimated_end_date','')::date,
   nullif(trim(payload->>'notes'),''),me);
 perform public.om_assign_project_number(pid);
 insert into public.om_project_status_history(company_id,business_unit_id,project_id,from_status,to_status,changed_by,comment)
 values(q.company_id,q.business_unit_id,pid,null,'pending',me,'Proyecto creado desde cotizacion '||coalesce(q.quotation_number,q.id::text));
 return pid;
end $$;

create or replace function public.om_update_project(target_project uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects;
begin
 if not public.has_permission('sales.projects.update') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite ediciones'; end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'El proyecto requiere un nombre'; end if;
 update public.om_projects set
   name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),
   client_company=coalesce(nullif(trim(payload->>'client_company'),''),client_company),
   client_rut=nullif(trim(payload->>'client_rut'),''),client_contact=nullif(trim(payload->>'client_contact'),''),
   client_email=nullif(trim(payload->>'client_email'),''),client_place=nullif(trim(payload->>'client_place'),''),
   execution_address=nullif(trim(payload->>'execution_address'),''),
   net_income=coalesce((payload->>'net_income')::numeric,net_income),
   estimated_start_date=nullif(payload->>'estimated_start_date','')::date,
   actual_start_date=nullif(payload->>'actual_start_date','')::date,
   estimated_end_date=nullif(payload->>'estimated_end_date','')::date,
   notes=nullif(trim(payload->>'notes'),''),
   updated_by=me,updated_at=now()
 where id=p.id;
end $$;

create or replace function public.om_set_project_responsible(target_project uuid,new_responsible uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects;
begin
 if not public.has_permission('sales.projects.manage_team') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite ediciones'; end if;
 if new_responsible is null then raise exception 'Debes indicar un responsable'; end if;
 if not exists(select 1 from public.user_business_units ubu where ubu.user_id=new_responsible and ubu.company_id=p.company_id and ubu.business_unit_id=p.business_unit_id) then
   raise exception 'El responsable no pertenece a la unidad';
 end if;
 update public.om_projects set responsible_id=new_responsible,updated_by=me,updated_at=now() where id=p.id;
end $$;

create or replace function public.om_add_project_member(target_project uuid,payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects; mid uuid:=gen_random_uuid(); mtype text:=payload->>'member_type'; prof uuid; ext text;
begin
 if not public.has_permission('sales.projects.manage_team') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite ediciones'; end if;
 if mtype not in('user','external') then raise exception 'Tipo de integrante invalido'; end if;
 if (payload->>'role') not in('jefe_proyecto','vendedor','supervisor','instalador','trabajador','colaborador_externo') then raise exception 'Rol invalido'; end if;
 if mtype='user' then
   prof:=nullif(payload->>'profile_id','')::uuid;
   if prof is null then raise exception 'Debes seleccionar un usuario'; end if;
   if not exists(select 1 from public.user_business_units ubu where ubu.user_id=prof and ubu.company_id=p.company_id and ubu.business_unit_id=p.business_unit_id) then
     raise exception 'El usuario no pertenece a la unidad';
   end if;
 else
   ext:=nullif(trim(payload->>'external_name'),'');
   if ext is null then raise exception 'Debes indicar el nombre del colaborador externo'; end if;
 end if;
 insert into public.om_project_members(id,company_id,business_unit_id,project_id,member_type,profile_id,external_name,role,note,created_by)
 values(mid,p.company_id,p.business_unit_id,p.id,mtype,prof,ext,payload->>'role',nullif(trim(payload->>'note'),''),me);
 return mid;
end $$;

create or replace function public.om_remove_project_member(target_member uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); m public.om_project_members; p public.om_projects;
begin
 if not public.has_permission('sales.projects.manage_team') then raise exception 'Sin autorizacion'; end if;
 select * into strict m from public.om_project_members where id=target_member for update;
 select * into strict p from public.om_projects where id=m.project_id for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite ediciones'; end if;
 delete from public.om_project_members where id=target_member;
end $$;

-- Transiciones permitidas: pending->manufacturing->installation->done,
-- y manufacturing->done directo si el proyecto no contempla instalacion.
create or replace function public.om_change_project_status(target_project uuid,target_status text,comment_text text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects; allowed boolean:=false;
begin
 if not public.has_permission('sales.projects.update') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if target_status not in('manufacturing','installation','done') then raise exception 'Estado destino invalido'; end if;
 allowed:=(p.status='pending' and target_status='manufacturing')
   or (p.status='manufacturing' and target_status in('installation','done'))
   or (p.status='installation' and target_status='done');
 if not allowed then raise exception 'Transicion de estado no permitida'; end if;
 update public.om_projects set status=target_status,updated_by=me,updated_at=now(),
   actual_start_date=case when actual_start_date is null and target_status in('manufacturing','installation') then current_date else actual_start_date end
 where id=p.id;
 insert into public.om_project_status_history(company_id,business_unit_id,project_id,from_status,to_status,changed_by,comment)
 values(p.company_id,p.business_unit_id,p.id,p.status,target_status,me,nullif(trim(comment_text),''));
end $$;

create or replace function public.om_close_project(target_project uuid,actual_end date,closure_notes_text text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects;
begin
 if not public.has_permission('sales.projects.close') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto ya esta cerrado'; end if;
 if nullif(trim(closure_notes_text),'') is null then raise exception 'Debes indicar una observacion final'; end if;
 update public.om_projects set status='done',closed_at=now(),closed_by=me,closure_notes=trim(closure_notes_text),
   actual_end_date=coalesce(actual_end,current_date),updated_by=me,updated_at=now()
 where id=p.id;
 insert into public.om_project_status_history(company_id,business_unit_id,project_id,from_status,to_status,changed_by,comment)
 values(p.company_id,p.business_unit_id,p.id,p.status,'done',me,trim(closure_notes_text));
end $$;

create or replace function public.om_reopen_project(target_project uuid,comment_text text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects;
begin
 if not public.has_permission('sales.projects.reopen') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status<>'done' then raise exception 'Solo se pueden reabrir proyectos finalizados'; end if;
 update public.om_projects set status='manufacturing',closed_at=null,closed_by=null,closure_notes=null,actual_end_date=null,
   updated_by=me,updated_at=now()
 where id=p.id;
 insert into public.om_project_status_history(company_id,business_unit_id,project_id,from_status,to_status,changed_by,comment)
 values(p.company_id,p.business_unit_id,p.id,'done','manufacturing',me,'Reapertura: '||coalesce(nullif(trim(comment_text),''),'sin comentario'));
end $$;

create or replace function public.om_cancel_project(target_project uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects;
begin
 if not public.has_permission('sales.projects.cancel') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto ya esta cerrado'; end if;
 if nullif(trim(reason),'') is null then raise exception 'Debes indicar el motivo de cancelacion'; end if;
 update public.om_projects set status='cancelled',cancelled_at=now(),cancelled_by=me,cancellation_reason=trim(reason),
   updated_by=me,updated_at=now()
 where id=p.id;
 insert into public.om_project_status_history(company_id,business_unit_id,project_id,from_status,to_status,changed_by,comment)
 values(p.company_id,p.business_unit_id,p.id,p.status,'cancelled',me,trim(reason));
end $$;

create or replace function public.om_create_project_expense(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects; eid uuid:=gen_random_uuid(); net numeric;
begin
 if not public.has_permission('sales.projects.manage_expenses') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=nullif(payload->>'project_id','')::uuid and deleted_at is null for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite nuevos gastos'; end if;
 net:=(payload->>'net_amount')::numeric;
 if net is null or net<0 then raise exception 'El monto neto debe ser mayor o igual a cero'; end if;
 if nullif(trim(payload->>'description'),'') is null then raise exception 'El gasto requiere una descripcion'; end if;
 if (payload->>'category') not in('materiales','mano_de_obra','transporte','instalacion','alimentacion','alojamiento','subcontratos','herramientas','combustible','otros') then
   raise exception 'Categoria invalida';
 end if;
 if (payload->>'document_type') not in('boleta','factura','boleta_honorarios','guia_despacho','factura_exenta','sin_documento','otro') then
   raise exception 'Tipo de documento invalido';
 end if;
 insert into public.om_project_expenses(id,company_id,business_unit_id,project_id,expense_date,category,description,supplier_name,supplier_rut,
   document_type,document_number,is_exempt,net_amount,payment_method,notes,created_by)
 values(eid,p.company_id,p.business_unit_id,p.id,coalesce(nullif(payload->>'expense_date','')::date,current_date),payload->>'category',
   trim(payload->>'description'),nullif(trim(payload->>'supplier_name'),''),nullif(trim(payload->>'supplier_rut'),''),
   payload->>'document_type',nullif(trim(payload->>'document_number'),''),coalesce((payload->>'is_exempt')::boolean,false),
   net,nullif(trim(payload->>'payment_method'),''),nullif(trim(payload->>'notes'),''),me);
 return eid;
end $$;

create or replace function public.om_update_project_expense(target_expense uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); e public.om_project_expenses; p public.om_projects; net numeric;
begin
 if not public.has_permission('sales.projects.manage_expenses') then raise exception 'Sin autorizacion'; end if;
 select * into strict e from public.om_project_expenses where id=target_expense for update;
 select * into strict p from public.om_projects where id=e.project_id for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite ediciones'; end if;
 if e.status='voided' then raise exception 'El gasto esta anulado'; end if;
 net:=(payload->>'net_amount')::numeric;
 if net is null or net<0 then raise exception 'El monto neto debe ser mayor o igual a cero'; end if;
 if nullif(trim(payload->>'description'),'') is null then raise exception 'El gasto requiere una descripcion'; end if;
 update public.om_project_expenses set
   expense_date=coalesce(nullif(payload->>'expense_date','')::date,expense_date),
   category=coalesce(payload->>'category',category),description=trim(payload->>'description'),
   supplier_name=nullif(trim(payload->>'supplier_name'),''),supplier_rut=nullif(trim(payload->>'supplier_rut'),''),
   document_type=coalesce(payload->>'document_type',document_type),document_number=nullif(trim(payload->>'document_number'),''),
   is_exempt=coalesce((payload->>'is_exempt')::boolean,is_exempt),net_amount=net,
   payment_method=nullif(trim(payload->>'payment_method'),''),notes=nullif(trim(payload->>'notes'),''),
   updated_by=me,updated_at=now()
 where id=e.id;
end $$;

create or replace function public.om_void_project_expense(target_expense uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); e public.om_project_expenses; p public.om_projects;
begin
 if not public.has_permission('sales.projects.manage_expenses') then raise exception 'Sin autorizacion'; end if;
 select * into strict e from public.om_project_expenses where id=target_expense for update;
 select * into strict p from public.om_projects where id=e.project_id for update;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if p.status in('done','cancelled') then raise exception 'El proyecto esta cerrado y no admite cambios en sus gastos'; end if;
 if e.status='voided' then raise exception 'El gasto ya esta anulado'; end if;
 if nullif(trim(reason),'') is null then raise exception 'Debes indicar el motivo de anulacion'; end if;
 update public.om_project_expenses set status='voided',voided_at=now(),voided_by=me,void_reason=trim(reason),updated_by=me,updated_at=now() where id=e.id;
end $$;

create or replace function public.om_add_project_note(target_project uuid,body_text text) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.om_projects; nid uuid:=gen_random_uuid();
begin
 if not public.has_permission('sales.projects.add_notes') then raise exception 'Sin autorizacion'; end if;
 select * into strict p from public.om_projects where id=target_project and deleted_at is null;
 if not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
 if nullif(trim(body_text),'') is null then raise exception 'La observacion no puede estar vacia'; end if;
 insert into public.om_project_notes(id,company_id,business_unit_id,project_id,body,created_by) values(nid,p.company_id,p.business_unit_id,target_project,trim(body_text),me);
 return nid;
end $$;

create or replace function public.om_edit_project_note(target_note uuid,body_text text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); n public.om_project_notes;
begin
 select * into strict n from public.om_project_notes where id=target_note and deleted_at is null for update;
 if n.created_by<>me or not public.has_permission('sales.projects.add_notes') then raise exception 'Sin autorizacion'; end if;
 if nullif(trim(body_text),'') is null then raise exception 'La observacion no puede estar vacia'; end if;
 update public.om_project_notes set body=trim(body_text),edited_at=now() where id=n.id;
end $$;

create or replace function public.om_delete_project_note(target_note uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); n public.om_project_notes;
begin
 select * into strict n from public.om_project_notes where id=target_note and deleted_at is null for update;
 if n.created_by<>me or not public.has_permission('sales.projects.add_notes') then raise exception 'Sin autorizacion'; end if;
 update public.om_project_notes set deleted_at=now() where id=n.id;
end $$;

-- user_business_units tiene RLS restringida a filas propias
-- (user_units_self), asi que no sirve para armar un listado de
-- responsable/equipo. Se agrega una funcion security definer, en el
-- mismo espiritu que public.shares_business_unit(), que exige que el
-- que llama ya tenga acceso a la unidad antes de listar a sus colegas.
create or replace function public.om_list_unit_members(target_company uuid,target_unit uuid) returns table(id uuid,first_name text,last_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_access_unit(target_company,target_unit) then raise exception 'Unidad no autorizada'; end if;
 return query select p.id,p.first_name,p.last_name from public.profiles p
   join public.user_business_units ubu on ubu.user_id=p.id
   where ubu.company_id=target_company and ubu.business_unit_id=target_unit and p.active and p.deleted_at is null
   order by p.first_name,p.last_name;
end $$;
revoke execute on function public.om_list_unit_members(uuid,uuid) from public,anon;
grant execute on function public.om_list_unit_members(uuid,uuid) to authenticated;

alter table public.om_project_sequences enable row level security;
alter table public.om_projects enable row level security;
alter table public.om_project_members enable row level security;
alter table public.om_project_expenses enable row level security;
alter table public.om_project_expense_attachments enable row level security;
alter table public.om_project_documents enable row level security;
alter table public.om_project_notes enable row level security;
alter table public.om_project_status_history enable row level security;

create policy om_projects_read on public.om_projects for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (
   created_by=(select auth.uid()) or responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view')
 )
);
create policy om_projects_insert on public.om_projects for insert to authenticated with check(
 created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and
 (public.has_permission('sales.projects.create') or public.has_permission('sales.projects.convert_from_quotation'))
);
create policy om_projects_update on public.om_projects for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (
   public.has_permission('sales.projects.update') or public.has_permission('sales.projects.manage_team') or
   public.has_permission('sales.projects.close') or public.has_permission('sales.projects.reopen') or public.has_permission('sales.projects.cancel')
 )
) with check(public.can_access_unit(company_id,business_unit_id));

create policy om_project_members_read on public.om_project_members for select to authenticated using(
 exists(select 1 from public.om_projects p where p.id=project_id and public.can_access_unit(p.company_id,p.business_unit_id))
);
create policy om_project_members_insert on public.om_project_members for insert to authenticated with check(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_team')
);
create policy om_project_members_delete on public.om_project_members for delete to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_team')
);

create policy om_project_expenses_read on public.om_project_expenses for select to authenticated using(
 exists(select 1 from public.om_projects p where p.id=project_id and public.can_access_unit(p.company_id,p.business_unit_id))
);
create policy om_project_expenses_insert on public.om_project_expenses for insert to authenticated with check(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_expenses')
);
create policy om_project_expenses_update on public.om_project_expenses for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_expenses')
) with check(public.can_access_unit(company_id,business_unit_id));

create policy om_project_expense_attachments_read on public.om_project_expense_attachments for select to authenticated using(
 exists(select 1 from public.om_project_expenses e join public.om_projects p on p.id=e.project_id where e.id=expense_id and public.can_access_unit(p.company_id,p.business_unit_id)
   and (p.created_by=(select auth.uid()) or p.responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view') or public.has_permission('sales.projects.manage_expenses')))
);
create policy om_project_expense_attachments_insert on public.om_project_expense_attachments for insert to authenticated with check(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_expenses')
);
create policy om_project_expense_attachments_delete on public.om_project_expense_attachments for delete to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_expenses')
);

create policy om_project_documents_read on public.om_project_documents for select to authenticated using(
 exists(select 1 from public.om_projects p where p.id=project_id and public.can_access_unit(p.company_id,p.business_unit_id)
   and (p.created_by=(select auth.uid()) or p.responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view') or public.has_permission('sales.projects.manage_documents')))
);
create policy om_project_documents_insert on public.om_project_documents for insert to authenticated with check(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_documents')
);
create policy om_project_documents_delete on public.om_project_documents for delete to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_documents')
);

create policy om_project_notes_read on public.om_project_notes for select to authenticated using(
 exists(select 1 from public.om_projects p where p.id=project_id and public.can_access_unit(p.company_id,p.business_unit_id))
);
create policy om_project_notes_insert on public.om_project_notes for insert to authenticated with check(
 created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.add_notes')
);
create policy om_project_notes_update on public.om_project_notes for update to authenticated using(
 created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.add_notes')
) with check(created_by=(select auth.uid()));

create policy om_project_status_history_read on public.om_project_status_history for select to authenticated using(
 exists(select 1 from public.om_projects p where p.id=project_id and public.can_access_unit(p.company_id,p.business_unit_id))
);
create policy om_project_status_history_insert on public.om_project_status_history for insert to authenticated with check(
 public.can_access_unit(company_id,business_unit_id)
);

revoke all on public.om_project_sequences from authenticated;
grant select,insert,update on public.om_projects to authenticated,service_role;
grant select,insert,delete on public.om_project_members to authenticated,service_role;
grant select,insert,update on public.om_project_expenses to authenticated,service_role;
grant select,insert,delete on public.om_project_expense_attachments to authenticated,service_role;
grant select,insert,delete on public.om_project_documents to authenticated,service_role;
grant select,insert,update on public.om_project_notes to authenticated,service_role;
grant select,insert on public.om_project_status_history to authenticated,service_role;
grant select,insert,update on public.om_project_sequences to service_role;

grant execute on function
 public.om_create_project(jsonb),
 public.om_convert_quotation_to_project(uuid,jsonb),
 public.om_update_project(uuid,jsonb),
 public.om_set_project_responsible(uuid,uuid),
 public.om_add_project_member(uuid,jsonb),
 public.om_remove_project_member(uuid),
 public.om_change_project_status(uuid,text,text),
 public.om_close_project(uuid,date,text),
 public.om_reopen_project(uuid,text),
 public.om_cancel_project(uuid,text),
 public.om_create_project_expense(jsonb),
 public.om_update_project_expense(uuid,jsonb),
 public.om_void_project_expense(uuid,text),
 public.om_add_project_note(uuid,text),
 public.om_edit_project_note(uuid,text),
 public.om_delete_project_note(uuid),
 public.om_assign_project_number(uuid)
to authenticated;
revoke execute on function public.om_next_project_sequence(uuid,smallint) from public,anon;
grant execute on function public.om_next_project_sequence(uuid,smallint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('modular-project-attachments','modular-project-attachments',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy storage_modular_project_expense_select on storage.objects for select to authenticated using(
 bucket_id='modular-project-attachments' and exists(
   select 1 from public.om_project_expense_attachments a join public.om_project_expenses e on e.id=a.expense_id join public.om_projects p on p.id=e.project_id
   where a.object_path=name and public.can_access_unit(p.company_id,p.business_unit_id)
     and (p.created_by=(select auth.uid()) or p.responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view') or public.has_permission('sales.projects.manage_expenses'))
 )
);
create policy storage_modular_project_expense_insert on storage.objects for insert to authenticated with check(
 bucket_id='modular-project-attachments' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('sales.projects.manage_expenses')
);
create policy storage_modular_project_expense_delete on storage.objects for delete to authenticated using(
 bucket_id='modular-project-attachments' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('sales.projects.manage_expenses')
);

create policy storage_modular_project_document_select on storage.objects for select to authenticated using(
 bucket_id='modular-project-attachments' and exists(
   select 1 from public.om_project_documents d join public.om_projects p on p.id=d.project_id
   where d.object_path=name and public.can_access_unit(p.company_id,p.business_unit_id)
     and (p.created_by=(select auth.uid()) or p.responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view') or public.has_permission('sales.projects.manage_documents'))
 )
);
create policy storage_modular_project_document_insert on storage.objects for insert to authenticated with check(
 bucket_id='modular-project-attachments' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('sales.projects.manage_documents')
);
create policy storage_modular_project_document_delete on storage.objects for delete to authenticated using(
 bucket_id='modular-project-attachments' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('sales.projects.manage_documents')
);

commit;
