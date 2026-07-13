begin;

create type public.inventory_material_status as enum ('active','inactive','pending_deletion');
create type public.inventory_request_type as enum ('edit','deactivate');
create type public.inventory_request_status as enum ('pending','approved','rejected');
create type public.inventory_movement_type as enum ('initial_stock','purchase','operational_consumption','loss');

insert into public.permissions(key,module,description) values
 ('inventory.materials.view','inventory','Consultar materiales y existencias'),
 ('inventory.materials.create','inventory','Crear materiales'),
 ('inventory.materials.request_change','inventory','Solicitar edición o desactivación de materiales'),
 ('inventory.purchases.create','inventory','Registrar facturas de compra'),
 ('inventory.outputs.create','inventory','Registrar salidas de materiales'),
 ('inventory.approvals.decide','inventory','Aprobar solicitudes de materiales'),
 ('inventory.reports.export','inventory','Consultar y exportar reportes de inventario')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='superadmin' and p.module='inventory' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
 ('inventory.materials.view','inventory.approvals.decide','inventory.reports.export')
where r.key='general_manager' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
 ('inventory.materials.view','inventory.materials.create','inventory.materials.request_change','inventory.purchases.create','inventory.outputs.create','inventory.approvals.decide','inventory.reports.export')
where r.key='area_manager' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
 ('inventory.materials.view','inventory.materials.create','inventory.materials.request_change','inventory.purchases.create','inventory.outputs.create','inventory.reports.export')
where r.key='administrator' on conflict do nothing;

create table public.inventory_material_sequences(
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 last_value integer not null default 0 check(last_value>=0),
 primary key(company_id,business_unit_id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create table public.inventory_materials(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 business_unit_id uuid not null, code text not null, name text not null, description text,
 category text not null, unit_of_measure text not null, standard_price numeric(16,2) not null check(standard_price>=0),
 average_price numeric(16,2) not null default 0 check(average_price>=0), last_purchase_price numeric(16,2),
 purchased_quantity numeric(16,3) not null default 0 check(purchased_quantity>=0), purchased_value numeric(18,2) not null default 0 check(purchased_value>=0),
 initial_stock numeric(16,3) not null default 0 check(initial_stock>=0), current_stock numeric(16,3) not null default 0 check(current_stock>=0),
 image_path text, image_name text, status public.inventory_material_status not null default 'active',
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id), unique(company_id,business_unit_id,code)
);
create table public.inventory_change_requests(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), business_unit_id uuid not null,
 material_id uuid not null references public.inventory_materials(id), request_type public.inventory_request_type not null,
 reason text not null check(length(trim(reason))>=3), current_data jsonb not null, proposed_data jsonb,
 status public.inventory_request_status not null default 'pending', requested_by uuid not null references public.profiles(id), requested_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id), decided_at timestamptz, decision_note text,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check((status='pending' and decided_by is null and decided_at is null) or (status<>'pending' and decided_by is not null and decided_at is not null))
);
create unique index inventory_one_pending_change on public.inventory_change_requests(material_id) where status='pending';
create table public.inventory_purchase_invoices(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), business_unit_id uuid not null,
 invoice_number text not null, supplier_id uuid not null references public.suppliers(id), purchase_date date not null, observations text,
 attachment_path text, attachment_name text, attachment_mime text, attachment_size bigint,
 entered_by uuid not null references public.profiles(id), entered_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id), unique(company_id,supplier_id,invoice_number)
);
create table public.inventory_purchase_lines(
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.inventory_purchase_invoices(id) on delete restrict,
 material_id uuid not null references public.inventory_materials(id), quantity numeric(16,3) not null check(quantity>0), unit_price numeric(16,2) not null check(unit_price>=0),
 line_total numeric(18,2) generated always as (round(quantity*unit_price,2)) stored, unique(invoice_id,material_id)
);
create table public.inventory_outputs(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), business_unit_id uuid not null,
 output_date date not null, material_id uuid not null references public.inventory_materials(id), quantity numeric(16,3) not null check(quantity>0),
 output_type public.inventory_movement_type not null check(output_type in ('operational_consumption','loss')), reason text,
 recorded_by uuid not null references public.profiles(id), recorded_at timestamptz not null default now(),
 stock_before numeric(16,3) not null, stock_after numeric(16,3) not null check(stock_after>=0),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(output_type<>'loss' or length(trim(coalesce(reason,'')))>=3)
);
create table public.inventory_movements(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), business_unit_id uuid not null,
 material_id uuid not null references public.inventory_materials(id), movement_date timestamptz not null default now(), movement_type public.inventory_movement_type not null,
 quantity_in numeric(16,3) not null default 0 check(quantity_in>=0), quantity_out numeric(16,3) not null default 0 check(quantity_out>=0),
 stock_before numeric(16,3) not null check(stock_before>=0), stock_after numeric(16,3) not null check(stock_after>=0),
 invoice_id uuid references public.inventory_purchase_invoices(id), output_id uuid references public.inventory_outputs(id), document_reference text,
 observation text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check((quantity_in>0 and quantity_out=0) or (quantity_out>0 and quantity_in=0))
);
create index inventory_material_search on public.inventory_materials(company_id,business_unit_id,status,name,category);
create index inventory_movements_history on public.inventory_movements(material_id,movement_date desc);
create index inventory_invoices_search on public.inventory_purchase_invoices(company_id,business_unit_id,purchase_date desc);
create index inventory_outputs_search on public.inventory_outputs(company_id,business_unit_id,output_date desc);
create trigger inventory_material_updated before update on public.inventory_materials for each row execute function public.set_updated_at();

create or replace function public.create_inventory_material(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); seq integer; result uuid; stock numeric:=coalesce((payload->>'initial_stock')::numeric,0); company uuid:=(payload->>'company_id')::uuid; unit uuid:=(payload->>'business_unit_id')::uuid;
begin
 if actor is null or not public.can_access_unit(company,unit) or not public.has_permission('inventory.materials.create') then raise exception 'Usuario no autorizado'; end if;
 insert into public.inventory_material_sequences(company_id,business_unit_id,last_value) values(company,unit,1)
 on conflict(company_id,business_unit_id) do update set last_value=public.inventory_material_sequences.last_value+1 returning last_value into seq;
 insert into public.inventory_materials(company_id,business_unit_id,code,name,description,category,unit_of_measure,standard_price,average_price,initial_stock,current_stock,image_path,image_name,created_by)
 values(company,unit,'MAT-'||lpad(seq::text,4,'0'),trim(payload->>'name'),nullif(trim(payload->>'description'),''),trim(payload->>'category'),trim(payload->>'unit_of_measure'),(payload->>'standard_price')::numeric,(payload->>'standard_price')::numeric,stock,stock,nullif(payload->>'image_path',''),nullif(payload->>'image_name',''),actor) returning id into result;
 if stock>0 then insert into public.inventory_movements(company_id,business_unit_id,material_id,movement_type,quantity_in,stock_before,stock_after,document_reference,observation,created_by)
 values(company,unit,result,'initial_stock',stock,0,stock,'Stock inicial','Creación del material',actor); end if;
 return result;
end $$;

create or replace function public.register_inventory_invoice(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid:=(payload->>'company_id')::uuid; unit uuid:=(payload->>'business_unit_id')::uuid; inv uuid; item jsonb; mat public.inventory_materials%rowtype; qty numeric; price numeric; new_stock numeric;
begin
 if actor is null or not public.can_access_unit(company,unit) or not public.has_permission('inventory.purchases.create') then raise exception 'Usuario no autorizado'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'))=0 then raise exception 'La factura debe incluir productos'; end if;
 if not exists(select 1 from public.suppliers s where s.id=(payload->>'supplier_id')::uuid and s.company_id=company and s.active and s.deleted_at is null) then raise exception 'Proveedor inválido para la empresa'; end if;
 insert into public.inventory_purchase_invoices(company_id,business_unit_id,invoice_number,supplier_id,purchase_date,observations,attachment_path,attachment_name,attachment_mime,attachment_size,entered_by)
 values(company,unit,trim(payload->>'invoice_number'),(payload->>'supplier_id')::uuid,(payload->>'purchase_date')::date,nullif(trim(payload->>'observations'),''),nullif(payload->>'attachment_path',''),nullif(payload->>'attachment_name',''),nullif(payload->>'attachment_mime',''),nullif(payload->>'attachment_size','')::bigint,actor) returning id into inv;
 for item in select * from jsonb_array_elements(payload->'lines') loop
  qty:=(item->>'quantity')::numeric; price:=(item->>'unit_price')::numeric;
  select * into mat from public.inventory_materials where id=(item->>'material_id')::uuid and company_id=company and business_unit_id=unit and status='active' for update;
  if not found then raise exception 'Material inválido o inactivo'; end if; if qty<=0 or price<0 then raise exception 'Cantidad o precio inválido'; end if;
  insert into public.inventory_purchase_lines(invoice_id,material_id,quantity,unit_price) values(inv,mat.id,qty,price);
  new_stock:=mat.current_stock+qty;
  update public.inventory_materials set current_stock=new_stock,last_purchase_price=price,purchased_quantity=purchased_quantity+qty,purchased_value=purchased_value+(qty*price),average_price=round((purchased_value+(qty*price))/(purchased_quantity+qty),2) where id=mat.id;
  insert into public.inventory_movements(company_id,business_unit_id,material_id,movement_type,quantity_in,stock_before,stock_after,invoice_id,document_reference,observation,created_by)
  values(company,unit,mat.id,'purchase',qty,mat.current_stock,new_stock,inv,'Factura '||trim(payload->>'invoice_number'),nullif(trim(payload->>'observations'),''),actor);
 end loop; return inv;
exception when unique_violation then raise exception 'Ya existe esta factura para el proveedor';
end $$;

create or replace function public.register_inventory_output(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid:=(payload->>'company_id')::uuid; unit uuid:=(payload->>'business_unit_id')::uuid; mat public.inventory_materials%rowtype; qty numeric:=(payload->>'quantity')::numeric; kind public.inventory_movement_type:=(payload->>'output_type')::public.inventory_movement_type; result uuid; after_stock numeric;
begin
 if actor is null or not public.can_access_unit(company,unit) or not public.has_permission('inventory.outputs.create') then raise exception 'Usuario no autorizado'; end if;
 select * into mat from public.inventory_materials where id=(payload->>'material_id')::uuid and company_id=company and business_unit_id=unit and status='active' for update;
 if not found then raise exception 'Material inválido o inactivo'; end if; if qty<=0 then raise exception 'Cantidad inválida'; end if;
 if kind='loss' and length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'La observación es obligatoria para falla o pérdida'; end if;
 if mat.current_stock<qty then raise exception 'No existe stock suficiente. Stock disponible: % %',mat.current_stock,mat.unit_of_measure; end if;
 after_stock:=mat.current_stock-qty;
 insert into public.inventory_outputs(company_id,business_unit_id,output_date,material_id,quantity,output_type,reason,recorded_by,stock_before,stock_after)
 values(company,unit,(payload->>'output_date')::date,mat.id,qty,kind,nullif(trim(payload->>'reason'),''),actor,mat.current_stock,after_stock) returning id into result;
 update public.inventory_materials set current_stock=after_stock where id=mat.id;
 insert into public.inventory_movements(company_id,business_unit_id,material_id,movement_date,movement_type,quantity_out,stock_before,stock_after,output_id,document_reference,observation,created_by)
 values(company,unit,(payload->>'material_id')::uuid,((payload->>'output_date')::date + localtime)::timestamptz,kind,qty,mat.current_stock,after_stock,result,case when kind='loss' then 'Falla o pérdida' else 'Consumo operacional' end,nullif(trim(payload->>'reason'),''),actor);
 return result;
end $$;

create or replace function public.request_inventory_material_change(material uuid, kind public.inventory_request_type, reason text, proposed jsonb default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); mat public.inventory_materials%rowtype; result uuid;
begin
 select * into mat from public.inventory_materials where id=material for update;
 if not found or not public.can_access_unit(mat.company_id,mat.business_unit_id) or not public.has_permission('inventory.materials.request_change') then raise exception 'Usuario no autorizado'; end if;
 if length(trim(reason))<3 then raise exception 'Debes indicar el motivo'; end if;
 insert into public.inventory_change_requests(company_id,business_unit_id,material_id,request_type,reason,current_data,proposed_data,requested_by)
 values(mat.company_id,mat.business_unit_id,mat.id,kind,trim(reason),to_jsonb(mat)-'updated_at',case when kind='edit' then proposed else null end,actor) returning id into result;
 if kind='deactivate' then update public.inventory_materials set status='pending_deletion' where id=mat.id; end if; return result;
end $$;

create or replace function public.decide_inventory_material_change(request uuid, decision public.inventory_request_status, note text default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); req public.inventory_change_requests%rowtype;
begin
 if decision not in ('approved','rejected') then raise exception 'Decisión inválida'; end if;
 select * into req from public.inventory_change_requests where id=request and status='pending' for update;
 if not found or not public.can_access_unit(req.company_id,req.business_unit_id) or not public.has_permission('inventory.approvals.decide') then raise exception 'Usuario no autorizado'; end if;
 if decision='approved' and req.request_type='edit' then
  update public.inventory_materials set name=trim(req.proposed_data->>'name'),description=nullif(trim(req.proposed_data->>'description'),''),category=trim(req.proposed_data->>'category'),unit_of_measure=trim(req.proposed_data->>'unit_of_measure'),standard_price=(req.proposed_data->>'standard_price')::numeric where id=req.material_id;
 elsif decision='approved' then update public.inventory_materials set status='inactive' where id=req.material_id;
 elsif req.request_type='deactivate' then update public.inventory_materials set status='active' where id=req.material_id; end if;
 update public.inventory_change_requests set status=decision,decided_by=actor,decided_at=now(),decision_note=nullif(trim(note),'') where id=request;
end $$;

revoke execute on function public.create_inventory_material(jsonb),public.register_inventory_invoice(jsonb),public.register_inventory_output(jsonb),public.request_inventory_material_change(uuid,public.inventory_request_type,text,jsonb),public.decide_inventory_material_change(uuid,public.inventory_request_status,text) from public,anon;
grant execute on function public.create_inventory_material(jsonb),public.register_inventory_invoice(jsonb),public.register_inventory_output(jsonb),public.request_inventory_material_change(uuid,public.inventory_request_type,text,jsonb),public.decide_inventory_material_change(uuid,public.inventory_request_status,text) to authenticated;

alter table public.inventory_material_sequences enable row level security; alter table public.inventory_materials enable row level security; alter table public.inventory_change_requests enable row level security;
alter table public.inventory_purchase_invoices enable row level security; alter table public.inventory_purchase_lines enable row level security; alter table public.inventory_outputs enable row level security; alter table public.inventory_movements enable row level security;
create policy inventory_materials_read on public.inventory_materials for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('inventory.materials.view'));
create policy inventory_requests_read on public.inventory_change_requests for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and (requested_by=auth.uid() or public.has_permission('inventory.approvals.decide')));
create policy inventory_invoices_read on public.inventory_purchase_invoices for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('inventory.materials.view'));
create policy inventory_lines_read on public.inventory_purchase_lines for select to authenticated using(exists(select 1 from public.inventory_purchase_invoices i where i.id=invoice_id and public.can_access_unit(i.company_id,i.business_unit_id) and public.has_permission('inventory.materials.view')));
create policy inventory_outputs_read on public.inventory_outputs for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('inventory.materials.view'));
create policy inventory_movements_read on public.inventory_movements for select to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('inventory.materials.view'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('inventory-material-images','inventory-material-images',false,5242880,array['image/jpeg','image/png']),
 ('inventory-invoices','inventory-invoices',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy inventory_images_select on storage.objects for select to authenticated using(bucket_id='inventory-material-images' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('inventory.materials.view'));
create policy inventory_images_insert on storage.objects for insert to authenticated with check(bucket_id='inventory-material-images' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('inventory.materials.create'));
create policy inventory_invoices_select on storage.objects for select to authenticated using(bucket_id='inventory-invoices' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('inventory.materials.view'));
create policy inventory_invoices_insert on storage.objects for insert to authenticated with check(bucket_id='inventory-invoices' and public.can_access_company(public.storage_company_id(name)) and public.has_permission('inventory.purchases.create'));

create trigger audit_inventory_materials after insert or update on public.inventory_materials for each row execute function public.audit_row_change();
create trigger audit_inventory_requests after insert or update on public.inventory_change_requests for each row execute function public.audit_row_change();
create trigger audit_inventory_invoices after insert on public.inventory_purchase_invoices for each row execute function public.audit_row_change();
create trigger audit_inventory_outputs after insert on public.inventory_outputs for each row execute function public.audit_row_change();

commit;
