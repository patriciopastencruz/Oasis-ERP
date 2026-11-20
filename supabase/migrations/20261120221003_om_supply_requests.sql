begin;

-- Abastecimiento de Oasis Modulares: pedido de materiales del maestro → consolidado de bodega →
-- lista de compras para el encargado de compras.
--  * Cada maestro pide, desde el celular, lo que necesita para los próximos días en su proyecto.
--  * Bodega junta los pedidos del día y arma la lista de compras: lo pedido − stock en bodega − lo que ya
--    está comprado y por llegar (así no se compra de más). Bodega ajusta cantidades y proveedor y la emite.
--  * El comprador ve la lista, marca lo comprado (o lo que no encontró) y bodega marca lo recibido.
-- Todo se escribe con funciones de PostgreSQL (permiso, unidad y asignación al proyecto se validan aquí);
-- las tablas solo se pueden leer con RLS. Cada cambio queda en audit_logs.

insert into public.permissions(key,module,description) values
 ('inventory.supply.request','inventory','Pedir materiales para los proyectos asignados (maestros)'),
 ('inventory.supply.consolidate','inventory','Revisar los pedidos de los maestros y armar la lista de compras (bodega)'),
 ('inventory.supply.buy','inventory','Ver las listas de compras y registrar lo comprado (encargado de compras)')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.roles(key,name,description,is_system) values
 ('foreman','Maestro','Pide desde el celular los materiales de su proyecto',true),
 ('warehouse_keeper','Encargado de bodega','Junta los pedidos de los maestros y arma la lista de compras',true),
 ('buyer','Encargado de compras','Compra lo que indica la lista de compras',true)
on conflict(key) do update set name=excluded.name,description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (r.key='foreman' and p.key='inventory.supply.request')
   or (r.key='warehouse_keeper' and p.key in('inventory.supply.request','inventory.supply.consolidate','inventory.materials.view'))
   or (r.key='buyer' and p.key='inventory.supply.buy')
   or (r.key in('administrator','superadmin','general_manager','operations_manager')
       and p.key in('inventory.supply.request','inventory.supply.consolidate','inventory.supply.buy'))
on conflict do nothing;

-- ---------- Tablas ----------
create table public.om_supply_purchase_lists(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 list_number text not null,
 status text not null default 'draft' check(status in('draft','issued','completed','cancelled')),
 cover_from date not null,
 cover_to date not null check(cover_to>=cover_from),
 notes text check(notes is null or char_length(notes)<=1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 issued_by uuid references public.profiles(id),
 issued_at timestamptz,
 completed_at timestamptz,
 cancelled_by uuid references public.profiles(id),
 cancelled_at timestamptz,
 cancel_reason text check(cancel_reason is null or char_length(cancel_reason)<=500),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,list_number)
);
create index om_supply_purchase_lists_unit_idx on public.om_supply_purchase_lists(company_id,business_unit_id,status,created_at desc);
create index om_supply_purchase_lists_created_by_idx on public.om_supply_purchase_lists(created_by);

create table public.om_supply_purchase_items(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 list_id uuid not null references public.om_supply_purchase_lists(id),
 material_id uuid references public.inventory_materials(id),
 name text not null check(char_length(btrim(name)) between 2 and 160),
 unit text not null check(char_length(btrim(unit)) between 1 and 40),
 requested_quantity numeric(16,3) not null check(requested_quantity>=0),
 stock_quantity numeric(16,3) not null default 0,
 in_transit_quantity numeric(16,3) not null default 0,
 quantity_to_buy numeric(16,3) not null check(quantity_to_buy>=0),
 supplier_id uuid references public.suppliers(id),
 supplier_name text,
 reference_price numeric(16,2),
 note text check(note is null or char_length(note)<=300),
 status text not null default 'pending' check(status in('pending','bought','received','not_found','covered')),
 bought_quantity numeric(16,3) check(bought_quantity is null or bought_quantity>0),
 resolution_note text check(resolution_note is null or char_length(resolution_note)<=300),
 resolved_by uuid references public.profiles(id),
 resolved_at timestamptz,
 received_by uuid references public.profiles(id),
 received_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_supply_purchase_items_list_idx on public.om_supply_purchase_items(list_id);
create index om_supply_purchase_items_material_idx on public.om_supply_purchase_items(material_id,status);
create index om_supply_purchase_items_supplier_idx on public.om_supply_purchase_items(supplier_id);

create table public.om_supply_requests(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id),
 -- Nombre del proyecto y del maestro al momento del pedido: quien pide no puede leer om_projects ni profiles ajenos.
 project_number text,
 project_name text not null,
 requester_name text,
 status text not null default 'draft' check(status in('draft','submitted','in_list','cancelled')),
 cover_from date not null,
 cover_to date not null check(cover_to>=cover_from),
 urgent boolean not null default false,
 urgent_reason text check(urgent_reason is null or char_length(urgent_reason)<=300),
 notes text check(notes is null or char_length(notes)<=1000),
 requested_by uuid not null references public.profiles(id),
 submitted_at timestamptz,
 purchase_list_id uuid references public.om_supply_purchase_lists(id),
 cancelled_at timestamptz,
 cancel_reason text check(cancel_reason is null or char_length(cancel_reason)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(not urgent or status='draft' or char_length(coalesce(btrim(urgent_reason),''))>=3)
);
create index om_supply_requests_unit_idx on public.om_supply_requests(company_id,business_unit_id,status,created_at desc);
create index om_supply_requests_project_idx on public.om_supply_requests(project_id);
create index om_supply_requests_requested_by_idx on public.om_supply_requests(requested_by,created_at desc);
create index om_supply_requests_list_idx on public.om_supply_requests(purchase_list_id) where purchase_list_id is not null;
-- Un solo borrador por maestro y proyecto: se sigue llenando hasta enviarlo.
create unique index om_supply_requests_one_draft_idx on public.om_supply_requests(project_id,requested_by) where status='draft';

create table public.om_supply_request_lines(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 request_id uuid not null references public.om_supply_requests(id),
 material_id uuid references public.inventory_materials(id),
 name text not null check(char_length(btrim(name)) between 2 and 160),
 unit text not null check(char_length(btrim(unit)) between 1 and 40),
 quantity numeric(16,3) not null check(quantity>0),
 note text check(note is null or char_length(note)<=300),
 purchase_item_id uuid references public.om_supply_purchase_items(id),
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_supply_request_lines_request_idx on public.om_supply_request_lines(request_id);
create index om_supply_request_lines_material_idx on public.om_supply_request_lines(material_id);
create index om_supply_request_lines_item_idx on public.om_supply_request_lines(purchase_item_id) where purchase_item_id is not null;

create trigger om_supply_purchase_lists_updated_at before update on public.om_supply_purchase_lists for each row execute function public.set_updated_at();
create trigger om_supply_purchase_items_updated_at before update on public.om_supply_purchase_items for each row execute function public.set_updated_at();
create trigger om_supply_requests_updated_at before update on public.om_supply_requests for each row execute function public.set_updated_at();
create trigger audit_om_supply_purchase_lists after insert or update on public.om_supply_purchase_lists for each row execute function public.audit_row_change();
create trigger audit_om_supply_purchase_items after insert or update on public.om_supply_purchase_items for each row execute function public.audit_row_change();
create trigger audit_om_supply_requests after insert or update on public.om_supply_requests for each row execute function public.audit_row_change();
create trigger audit_om_supply_request_lines after insert or update on public.om_supply_request_lines for each row execute function public.audit_row_change();

-- ---------- RLS: solo lectura; las escrituras pasan por las funciones de abajo ----------
alter table public.om_supply_purchase_lists enable row level security;
alter table public.om_supply_purchase_items enable row level security;
alter table public.om_supply_requests enable row level security;
alter table public.om_supply_request_lines enable row level security;

-- El maestro ve sus pedidos; bodega y gerencia ven todos.
create policy om_supply_requests_read on public.om_supply_requests for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id)
  and (public.has_permission('inventory.supply.consolidate') or requested_by=(select auth.uid())));
create policy om_supply_request_lines_read on public.om_supply_request_lines for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id)
  and exists(select 1 from public.om_supply_requests r where r.id=request_id));
-- El comprador solo ve listas ya emitidas; bodega ve también los borradores.
create policy om_supply_purchase_lists_read on public.om_supply_purchase_lists for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id)
  and (public.has_permission('inventory.supply.consolidate')
   or (public.has_permission('inventory.supply.buy') and status<>'draft')));
create policy om_supply_purchase_items_read on public.om_supply_purchase_items for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id)
  and exists(select 1 from public.om_supply_purchase_lists l where l.id=list_id));

revoke all on public.om_supply_purchase_lists,public.om_supply_purchase_items,public.om_supply_requests,public.om_supply_request_lines from public,anon,authenticated;
grant select on public.om_supply_purchase_lists,public.om_supply_purchase_items,public.om_supply_requests,public.om_supply_request_lines to authenticated;
grant select,insert,update,delete on public.om_supply_purchase_lists,public.om_supply_purchase_items,public.om_supply_requests,public.om_supply_request_lines to service_role;

-- ---------- Funciones internas ----------
create function public.om_supply_unit() returns public.business_units
language plpgsql stable security definer set search_path='' as $$
declare u public.business_units;
begin
 select * into u from public.business_units where code='OM' and active and deleted_at is null and public.can_access_unit(company_id,id) limit 1;
 if u.id is null then raise exception 'Unidad no autorizada'; end if;
 return u;
end $$;

-- Avisa a quienes tienen un permiso en la unidad (sin repetir al autor).
create function public.om_supply_notify(p_unit public.business_units,p_permission text,p_actor uuid,p_event text,p_title text,p_body text,p_entity_type text,p_entity uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select p_unit.company_id,p_unit.id,p.id,p_event,p_title,p_body,p_entity_type,p_entity,p_actor
 from public.profiles p join public.user_business_units ubu on ubu.user_id=p.id and ubu.business_unit_id=p_unit.id
 where p.active and p.deleted_at is null and p.id is distinct from p_actor and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=p.role_id and k.key=p_permission and k.active)
$$;
revoke execute on function public.om_supply_unit() from public,anon,authenticated;
revoke execute on function public.om_supply_notify(public.business_units,text,uuid,text,text,text,text,uuid) from public,anon,authenticated;

-- ---------- Consultas para las pantallas ----------
-- Catálogo para pedir: sin precios ni stock (el maestro no ve costos).
create function public.om_supply_catalog() returns table(id uuid,code text,name text,category text,unit text)
language plpgsql stable security definer set search_path='' as $$
declare u public.business_units;
begin
 if not(public.has_permission('inventory.supply.request') or public.has_permission('inventory.supply.consolidate')) then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 return query select m.id,m.code,m.name,m.category,m.unit_of_measure from public.inventory_materials m
  where m.business_unit_id=u.id and m.status='active' order by m.category,m.name;
end $$;

-- Proyectos activos del maestro (responsable o integrante del equipo); bodega y gerencia ven todos.
create function public.om_supply_my_projects() returns table(id uuid,project_number text,name text,place text,status text)
language plpgsql stable security definer set search_path='' as $$
declare u public.business_units; me uuid:=auth.uid();
begin
 if not(public.has_permission('inventory.supply.request') or public.has_permission('inventory.supply.consolidate')) then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 return query select p.id,p.project_number,p.name,coalesce(p.execution_address,p.client_place),p.status::text
  from public.om_projects p
  where p.business_unit_id=u.id and p.deleted_at is null and p.status::text in('pending','manufacturing','installation')
   and (public.has_permission('inventory.supply.consolidate') or p.responsible_id=me
    or exists(select 1 from public.om_project_members m where m.project_id=p.id and m.profile_id=me))
  order by p.project_number desc nulls last;
end $$;

create function public.om_supply_suppliers() returns table(id uuid,name text)
language plpgsql stable security definer set search_path='' as $$
declare u public.business_units;
begin
 if not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 return query select s.id,coalesce(nullif(btrim(s.trade_name),''),s.legal_name) from public.suppliers s
  where s.company_id=u.company_id and s.active order by 2;
end $$;

-- ---------- Maestro: guardar borrador o enviar el pedido ----------
create function public.om_supply_save_request(p_request uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; pr public.om_projects; r public.om_supply_requests; mat public.inventory_materials;
 rid uuid; ln jsonb; qty numeric; nm text; un text; n int:=0; me_name text;
 today date:=(now() at time zone 'America/Santiago')::date;
 v_from date; v_to date;
 v_submit boolean:=coalesce((p_payload->>'submit')::boolean,false);
 v_urgent boolean:=coalesce((p_payload->>'urgent')::boolean,false);
 v_reason text:=left(nullif(btrim(coalesce(p_payload->>'urgent_reason','')),''),300);
 v_notes text:=left(nullif(btrim(coalesce(p_payload->>'notes','')),''),1000);
 lines jsonb:=coalesce(p_payload->'lines','[]'::jsonb);
begin
 if me is null or not public.has_permission('inventory.supply.request') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into pr from public.om_projects where id=nullif(p_payload->>'project_id','')::uuid and business_unit_id=u.id and deleted_at is null;
 if pr.id is null then raise exception 'Proyecto no encontrado'; end if;
 if pr.status::text not in('pending','manufacturing','installation') then raise exception 'El proyecto no esta activo'; end if;
 if not public.has_permission('inventory.supply.consolidate') and pr.responsible_id is distinct from me
    and not exists(select 1 from public.om_project_members m where m.project_id=pr.id and m.profile_id=me) then
  raise exception 'No tienes asignado ese proyecto'; end if;
 v_from:=nullif(p_payload->>'cover_from','')::date; v_to:=nullif(p_payload->>'cover_to','')::date;
 if v_from is null or v_to is null or v_to<v_from then raise exception 'Indica los dias que cubre el pedido'; end if;
 if v_from<today then raise exception 'El pedido no puede empezar antes de hoy'; end if;
 if v_to>v_from+6 then raise exception 'El pedido cubre como maximo 7 dias'; end if;
 select btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) into me_name from public.profiles where id=me;
 if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines) not between 1 and 80 then raise exception 'Agrega entre 1 y 80 materiales'; end if;
 if v_urgent and v_submit and (v_reason is null or char_length(v_reason)<3) then raise exception 'Indica por que es urgente'; end if;

 if p_request is not null then
  select * into r from public.om_supply_requests where id=p_request for update;
  if r.id is null or r.business_unit_id<>u.id or (r.requested_by<>me and not public.has_permission('inventory.supply.consolidate')) then raise exception 'Pedido no encontrado'; end if;
  if r.status<>'draft' then raise exception 'El pedido ya fue enviado'; end if;
  rid:=r.id;
 else
  select id into rid from public.om_supply_requests where project_id=pr.id and requested_by=me and status='draft' for update;
 end if;
 if rid is null then
  insert into public.om_supply_requests(company_id,business_unit_id,project_id,project_number,project_name,requester_name,cover_from,cover_to,urgent,urgent_reason,notes,requested_by)
  values(u.company_id,u.id,pr.id,pr.project_number,pr.name,nullif(me_name,''),v_from,v_to,v_urgent,case when v_urgent then v_reason end,v_notes,me) returning id into rid;
 else
  update public.om_supply_requests set project_id=pr.id,project_number=pr.project_number,project_name=pr.name,cover_from=v_from,cover_to=v_to,urgent=v_urgent,
   urgent_reason=case when v_urgent then v_reason end,notes=v_notes where id=rid;
 end if;

 delete from public.om_supply_request_lines where request_id=rid;
 for ln in select * from jsonb_array_elements(lines) loop
  qty:=nullif(ln->>'quantity','')::numeric;
  if qty is null or qty<=0 or qty>=1000000 then raise exception 'Cada material necesita una cantidad mayor que cero'; end if;
  if nullif(ln->>'material_id','') is not null then
   select * into mat from public.inventory_materials where id=(ln->>'material_id')::uuid and business_unit_id=u.id and status::text='active';
   if mat.id is null then raise exception 'Material no encontrado en el catalogo'; end if;
   insert into public.om_supply_request_lines(company_id,business_unit_id,request_id,material_id,name,unit,quantity,note)
   values(u.company_id,u.id,rid,mat.id,mat.name,mat.unit_of_measure,qty,left(nullif(btrim(coalesce(ln->>'note','')),''),300));
  else
   nm:=left(btrim(coalesce(ln->>'custom_name','')),160); un:=left(btrim(coalesce(ln->>'unit','')),40);
   if char_length(nm)<2 then raise exception 'Escribe el nombre del material que no esta en el catalogo'; end if;
   if un='' then un:='un'; end if;
   insert into public.om_supply_request_lines(company_id,business_unit_id,request_id,name,unit,quantity,note)
   values(u.company_id,u.id,rid,nm,un,qty,left(nullif(btrim(coalesce(ln->>'note','')),''),300));
  end if;
  n:=n+1;
 end loop;

 if v_submit then
  update public.om_supply_requests set status='submitted',submitted_at=now() where id=rid;
  perform public.om_supply_notify(u,'inventory.supply.consolidate',me,
   case when v_urgent then 'inventory.supply_urgent.review_assigned' else 'inventory.supply.request_submitted' end,
   case when v_urgent then 'Pedido URGENTE de materiales' else 'Pedido de materiales por revisar' end,
   coalesce(nullif(me_name,''),'Un maestro')||' pidio '||n||case when n=1 then ' material' else ' materiales' end||' para '
    ||coalesce(pr.project_number||' · ','')||pr.name||' (del '||to_char(v_from,'DD-MM')||' al '||to_char(v_to,'DD-MM')||')'
    ||case when v_urgent then '. Urgente: '||left(v_reason,120) else '' end,
   'om_supply_request',rid);
 end if;
 return rid;
end $$;

-- Anular un pedido que aún no está en una lista de compras (el maestro, el suyo; bodega, cualquiera).
create function public.om_supply_cancel_request(p_request uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; r public.om_supply_requests; v_reason text:=left(nullif(btrim(coalesce(p_reason,'')),''),500);
begin
 if me is null or not(public.has_permission('inventory.supply.request') or public.has_permission('inventory.supply.consolidate')) then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into r from public.om_supply_requests where id=p_request for update;
 if r.id is null or r.business_unit_id<>u.id or (r.requested_by<>me and not public.has_permission('inventory.supply.consolidate')) then raise exception 'Pedido no encontrado'; end if;
 if r.status not in('draft','submitted') then raise exception 'El pedido ya esta en una lista de compras o anulado'; end if;
 if r.status='submitted' and (v_reason is null or char_length(v_reason)<3) then raise exception 'Indica el motivo de la anulacion'; end if;
 update public.om_supply_requests set status='cancelled',cancelled_at=now(),cancel_reason=v_reason where id=r.id;
end $$;

-- ---------- Bodega: armar, ajustar, emitir y anular la lista de compras ----------
create function public.om_supply_build_purchase_list(p_requests uuid[],p_notes text) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; g record; mat public.inventory_materials;
 lid uuid:=gen_random_uuid(); iid uuid; n int; seq int; v_from date; v_to date; num text; prefix text;
 v_stock numeric; v_transit numeric; v_buy numeric; v_price numeric; v_sup uuid; v_supname text;
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 if p_requests is null or cardinality(p_requests)=0 then raise exception 'Elige al menos un pedido'; end if;
 perform 1 from public.om_supply_requests where id=any(p_requests) for update;
 select count(*),min(cover_from),max(cover_to) into n,v_from,v_to from public.om_supply_requests
  where id=any(p_requests) and business_unit_id=u.id and status='submitted';
 if n=0 or n<>(select count(distinct x) from unnest(p_requests) x) then raise exception 'Algunos pedidos ya no estan disponibles'; end if;

 perform pg_advisory_xact_lock(hashtextextended('om_supply_list_'||u.id::text,0));
 prefix:='LC-'||to_char(today,'YYMMDD')||'-';
 select count(*)+1 into seq from public.om_supply_purchase_lists where business_unit_id=u.id and list_number like prefix||'%';
 num:=prefix||lpad(seq::text,2,'0');
 insert into public.om_supply_purchase_lists(id,company_id,business_unit_id,list_number,cover_from,cover_to,notes,created_by)
 values(lid,u.company_id,u.id,num,v_from,v_to,left(nullif(btrim(coalesce(p_notes,'')),''),1000),me);

 for g in
  select l.material_id,min(l.name) as name,min(l.unit) as unit,sum(l.quantity) as qty
  from public.om_supply_request_lines l where l.request_id=any(p_requests)
  group by l.material_id,case when l.material_id is null then lower(btrim(l.name))||'|'||lower(btrim(l.unit)) end
  order by min(l.name)
 loop
  v_stock:=0; v_transit:=0; v_price:=null; v_sup:=null; v_supname:=null;
  if g.material_id is not null then
   select * into mat from public.inventory_materials where id=g.material_id;
   v_stock:=mat.current_stock;
   -- Ya pedido a compras y todavía sin recibir en bodega: se descuenta para no comprarlo dos veces.
   select coalesce(sum(case when i.status='pending' then i.quantity_to_buy
                            when i.status='bought' then coalesce(i.bought_quantity,i.quantity_to_buy) else 0 end),0)
    into v_transit
    from public.om_supply_purchase_items i join public.om_supply_purchase_lists pl on pl.id=i.list_id
    where i.material_id=mat.id and pl.status in('issued','completed');
   v_price:=coalesce(mat.last_purchase_price,nullif(mat.average_price,0));
   select s.id,coalesce(nullif(btrim(s.trade_name),''),s.legal_name) into v_sup,v_supname
    from public.inventory_purchase_lines pln
    join public.inventory_purchase_invoices inv on inv.id=pln.invoice_id
    join public.suppliers s on s.id=inv.supplier_id
    where pln.material_id=mat.id order by inv.purchase_date desc,inv.entered_at desc limit 1;
  end if;
  v_buy:=greatest(0,g.qty-v_stock-v_transit);
  insert into public.om_supply_purchase_items(company_id,business_unit_id,list_id,material_id,name,unit,requested_quantity,stock_quantity,
   in_transit_quantity,quantity_to_buy,supplier_id,supplier_name,reference_price,status)
  values(u.company_id,u.id,lid,g.material_id,g.name,g.unit,g.qty,v_stock,v_transit,v_buy,v_sup,v_supname,v_price,
   case when v_buy=0 then 'covered' else 'pending' end) returning id into iid;
  update public.om_supply_request_lines set purchase_item_id=iid
   where request_id=any(p_requests)
    and ((g.material_id is not null and material_id=g.material_id)
     or (g.material_id is null and material_id is null and lower(btrim(name))=lower(btrim(g.name)) and lower(btrim(unit))=lower(btrim(g.unit))));
 end loop;

 update public.om_supply_requests set status='in_list',purchase_list_id=lid where id=any(p_requests);
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select distinct on (r.requested_by) u.company_id,u.id,r.requested_by,'inventory.supply.request_in_list','Tu pedido de materiales pasó a compras',
  'Bodega incluyó tu pedido para '||coalesce(r.project_number||' · ','')||r.project_name||' en la lista de compras '||num||'.',
  'om_supply_request',r.id,me
 from public.om_supply_requests r
 where r.id=any(p_requests) and r.requested_by<>me
 order by r.requested_by,r.created_at;
 return lid;
end $$;

create function public.om_supply_update_item(p_item uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; it public.om_supply_purchase_items; l public.om_supply_purchase_lists;
 v_q numeric; v_sup uuid; v_supname text; v_note text;
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into it from public.om_supply_purchase_items where id=p_item for update;
 if it.id is null or it.business_unit_id<>u.id then raise exception 'Producto no encontrado'; end if;
 select * into l from public.om_supply_purchase_lists where id=it.list_id;
 if l.status<>'draft' then raise exception 'La lista ya fue emitida'; end if;
 v_q:=it.quantity_to_buy; v_sup:=it.supplier_id; v_supname:=it.supplier_name; v_note:=it.note;
 if p_payload ? 'quantity_to_buy' then
  v_q:=nullif(p_payload->>'quantity_to_buy','')::numeric;
  if v_q is null or v_q<0 or v_q>=1000000 then raise exception 'La cantidad a comprar no es valida'; end if;
 end if;
 if p_payload ? 'supplier_id' then
  if nullif(p_payload->>'supplier_id','') is null then v_sup:=null; v_supname:=null;
  else
   select s.id,coalesce(nullif(btrim(s.trade_name),''),s.legal_name) into v_sup,v_supname from public.suppliers s
    where s.id=(p_payload->>'supplier_id')::uuid and s.company_id=u.company_id and s.active;
   if v_sup is null then raise exception 'Proveedor no encontrado'; end if;
  end if;
 end if;
 if p_payload ? 'note' then v_note:=left(nullif(btrim(coalesce(p_payload->>'note','')),''),300); end if;
 update public.om_supply_purchase_items set quantity_to_buy=v_q,supplier_id=v_sup,supplier_name=v_supname,note=v_note,
  status=case when v_q=0 then 'covered' else 'pending' end where id=it.id;
end $$;

create function public.om_supply_add_item(p_list uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; l public.om_supply_purchase_lists; mat public.inventory_materials; iid uuid;
 v_name text:=left(btrim(coalesce(p_payload->>'name','')),160); v_unit text:=left(btrim(coalesce(p_payload->>'unit','')),40);
 v_q numeric:=nullif(p_payload->>'quantity','')::numeric; v_mat uuid:=nullif(p_payload->>'material_id','')::uuid; v_price numeric;
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into l from public.om_supply_purchase_lists where id=p_list and business_unit_id=u.id for update;
 if l.id is null then raise exception 'Lista no encontrada'; end if;
 if l.status<>'draft' then raise exception 'La lista ya fue emitida'; end if;
 if v_q is null or v_q<=0 or v_q>=1000000 then raise exception 'La cantidad no es valida'; end if;
 if v_mat is not null then
  select * into mat from public.inventory_materials where id=v_mat and business_unit_id=u.id and status::text='active';
  if mat.id is null then raise exception 'Material no encontrado en el catalogo'; end if;
  v_name:=mat.name; v_unit:=mat.unit_of_measure; v_price:=coalesce(mat.last_purchase_price,nullif(mat.average_price,0));
 end if;
 if char_length(v_name)<2 then raise exception 'Escribe el nombre del producto'; end if;
 if v_unit='' then v_unit:='un'; end if;
 insert into public.om_supply_purchase_items(company_id,business_unit_id,list_id,material_id,name,unit,requested_quantity,quantity_to_buy,reference_price)
 values(u.company_id,u.id,l.id,v_mat,v_name,v_unit,v_q,v_q,v_price) returning id into iid;
 return iid;
end $$;

-- Emite la lista al comprador. Si todo está cubierto con stock, queda terminada sin avisar a compras.
create function public.om_supply_issue_list(p_list uuid) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; l public.om_supply_purchase_lists; pend int; total int;
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into l from public.om_supply_purchase_lists where id=p_list and business_unit_id=u.id for update;
 if l.id is null then raise exception 'Lista no encontrada'; end if;
 if l.status<>'draft' then raise exception 'La lista ya fue emitida'; end if;
 select count(*) filter (where status='pending'),count(*) into pend,total from public.om_supply_purchase_items where list_id=l.id;
 if total=0 then raise exception 'La lista no tiene productos'; end if;
 if pend=0 then
  update public.om_supply_purchase_lists set status='completed',issued_by=me,issued_at=now(),completed_at=now() where id=l.id;
  return 'completed';
 end if;
 update public.om_supply_purchase_lists set status='issued',issued_by=me,issued_at=now() where id=l.id;
 perform public.om_supply_notify(u,'inventory.supply.buy',me,'inventory.supply_list.review_assigned','Nueva lista de compras',
  'Lista '||l.list_number||': '||pend||case when pend=1 then ' producto' else ' productos' end||' por comprar, para los días del '
   ||to_char(l.cover_from,'DD-MM')||' al '||to_char(l.cover_to,'DD-MM')||'.','om_supply_purchase_list',l.id);
 return 'issued';
end $$;

-- Comprador: bought / not_found / reopen. Bodega: received / unreceive.
create function public.om_supply_mark_item(p_item uuid,p_action text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; it public.om_supply_purchase_items; l public.om_supply_purchase_lists;
 v_q numeric; v_note text:=left(nullif(btrim(coalesce(p_payload->>'note','')),''),300); pend int; bought int; missing int;
begin
 if me is null then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into it from public.om_supply_purchase_items where id=p_item for update;
 if it.id is null or it.business_unit_id<>u.id then raise exception 'Producto no encontrado'; end if;
 select * into l from public.om_supply_purchase_lists where id=it.list_id for update;
 if l.status not in('issued','completed') then raise exception 'La lista no esta activa'; end if;
 if p_action in('bought','not_found','reopen') then
  if not public.has_permission('inventory.supply.buy') then raise exception 'Sin autorizacion'; end if;
 elsif p_action in('received','unreceive') then
  if not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 else raise exception 'Accion no valida'; end if;

 if p_action='bought' then
  if it.status not in('pending','not_found') then raise exception 'Este producto ya no esta pendiente'; end if;
  v_q:=coalesce(nullif(p_payload->>'quantity','')::numeric,it.quantity_to_buy);
  if v_q is null or v_q<=0 or v_q>=1000000 then raise exception 'La cantidad comprada no es valida'; end if;
  update public.om_supply_purchase_items set status='bought',bought_quantity=v_q,resolution_note=v_note,resolved_by=me,resolved_at=now() where id=it.id;
 elsif p_action='not_found' then
  if it.status not in('pending','bought') then raise exception 'Este producto no se puede marcar asi'; end if;
  if v_note is null or char_length(v_note)<3 then raise exception 'Indica por que no se pudo comprar'; end if;
  update public.om_supply_purchase_items set status='not_found',bought_quantity=null,resolution_note=v_note,resolved_by=me,resolved_at=now() where id=it.id;
 elsif p_action='reopen' then
  if it.status not in('bought','not_found') then raise exception 'Este producto no se puede reabrir'; end if;
  update public.om_supply_purchase_items set status='pending',bought_quantity=null,resolution_note=null,resolved_by=null,resolved_at=null where id=it.id;
 elsif p_action='received' then
  if it.status<>'bought' then raise exception 'Solo se recibe lo que ya fue comprado'; end if;
  update public.om_supply_purchase_items set status='received',received_by=me,received_at=now() where id=it.id;
 else
  if it.status<>'received' then raise exception 'Este producto no esta recibido'; end if;
  update public.om_supply_purchase_items set status='bought',received_by=null,received_at=null where id=it.id;
 end if;

 select count(*) filter (where status='pending'),count(*) filter (where status in('bought','received')),count(*) filter (where status='not_found')
  into pend,bought,missing from public.om_supply_purchase_items where list_id=l.id;
 if pend=0 and l.status='issued' then
  update public.om_supply_purchase_lists set status='completed',completed_at=now() where id=l.id;
  perform public.om_supply_notify(u,'inventory.supply.consolidate',me,'inventory.supply.list_completed','Lista de compras terminada',
   'Lista '||l.list_number||': '||bought||' comprados'||case when missing>0 then ' y '||missing||' sin encontrar' else '' end||'.',
   'om_supply_purchase_list',l.id);
 elsif pend>0 and l.status='completed' then
  update public.om_supply_purchase_lists set status='issued',completed_at=null where id=l.id;
 end if;
end $$;

-- Anula una lista que aún no tiene compras; sus pedidos vuelven a estar disponibles para armar otra.
create function public.om_supply_cancel_list(p_list uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; l public.om_supply_purchase_lists; v_reason text:=left(nullif(btrim(coalesce(p_reason,'')),''),500);
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into l from public.om_supply_purchase_lists where id=p_list and business_unit_id=u.id for update;
 if l.id is null then raise exception 'Lista no encontrada'; end if;
 if l.status not in('draft','issued') then raise exception 'Esta lista ya no se puede anular'; end if;
 if exists(select 1 from public.om_supply_purchase_items where list_id=l.id and status in('bought','received')) then
  raise exception 'La lista ya tiene productos comprados'; end if;
 if v_reason is null or char_length(v_reason)<3 then raise exception 'Indica el motivo de la anulacion'; end if;
 update public.om_supply_purchase_lists set status='cancelled',cancelled_by=me,cancelled_at=now(),cancel_reason=v_reason where id=l.id;
 update public.om_supply_request_lines set purchase_item_id=null where purchase_item_id in(select id from public.om_supply_purchase_items where list_id=l.id);
 update public.om_supply_requests set status='submitted',purchase_list_id=null where purchase_list_id=l.id and status='in_list';
 if l.status='issued' then
  perform public.om_supply_notify(u,'inventory.supply.buy',me,'inventory.supply.list_cancelled','Lista de compras anulada',
   'La lista '||l.list_number||' fue anulada. Motivo: '||left(v_reason,120),'om_supply_purchase_list',l.id);
 end if;
end $$;

revoke execute on function public.om_supply_catalog(),public.om_supply_my_projects(),public.om_supply_suppliers(),
 public.om_supply_save_request(uuid,jsonb),public.om_supply_cancel_request(uuid,text),
 public.om_supply_build_purchase_list(uuid[],text),public.om_supply_update_item(uuid,jsonb),public.om_supply_add_item(uuid,jsonb),
 public.om_supply_issue_list(uuid),public.om_supply_mark_item(uuid,text,jsonb),public.om_supply_cancel_list(uuid,text)
 from public,anon;
grant execute on function public.om_supply_catalog(),public.om_supply_my_projects(),public.om_supply_suppliers(),
 public.om_supply_save_request(uuid,jsonb),public.om_supply_cancel_request(uuid,text),
 public.om_supply_build_purchase_list(uuid[],text),public.om_supply_update_item(uuid,jsonb),public.om_supply_add_item(uuid,jsonb),
 public.om_supply_issue_list(uuid),public.om_supply_mark_item(uuid,text,jsonb),public.om_supply_cancel_list(uuid,text)
 to authenticated;

commit;
