begin;

insert into public.permissions(key,module,description) values
 ('finance.distribution.stock.view','finance.distribution','Consultar stock de materia prima de Distribuidora Altiplánica'),
 ('finance.distribution.stock.manage','finance.distribution','Registrar compras y salidas de materia prima de Distribuidora Altiplánica')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('superadmin','general_manager','operations_manager','administrator','administrative')
  and p.key in ('finance.distribution.stock.view','finance.distribution.stock.manage')
on conflict do nothing;

-- Catálogo controlado e idempotente. Se crea al primer acceso porque en un
-- entorno local la unidad DA se incorpora después de aplicar las migraciones.
create or replace function public.ensure_distribution_stock_catalog(target_unit uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid;
begin
 select company_id into company from public.business_units where id=target_unit and code='DA' and active;
 if actor is null or company is null or not public.can_access_unit(company,target_unit)
    or not public.has_permission('finance.distribution.stock.view') then
  raise exception 'Usuario no autorizado';
 end if;

 insert into public.inventory_materials(company_id,business_unit_id,code,name,category,unit_of_measure,standard_price,average_price,created_by)
 select company,target_unit,x.code,x.name,x.category,'unidad',0,0,actor
 from (values
  ('DA-MP-ICE-1KG','Bolsa para hielo 1 kg','Bolsas para hielo'),
  ('DA-MP-ICE-2KG','Bolsa para hielo 2 kg','Bolsas para hielo'),
  ('DA-MP-FRAPPE-1KG','Bolsa para frappé 1 kg','Bolsas para frappé'),
  ('DA-MP-FRAPPE-2KG','Bolsa para frappé 2 kg','Bolsas para frappé'),
  ('DA-MP-WATER-20L','Envase de agua 20 L','Envases de agua'),
  ('DA-MP-WATER-6L','Envase de agua 6 L','Envases de agua'),
  ('DA-MP-WATER-16L','Envase de agua 1,6 L','Envases de agua'),
  ('DA-MP-WATER-600CC','Envase de agua 600 cc','Envases de agua')
 ) x(code,name,category)
 on conflict(company_id,business_unit_id,code) do update
 set name=excluded.name,category=excluded.category,unit_of_measure=excluded.unit_of_measure,status='active';
end $$;

create or replace function public.register_inventory_invoice(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid:=(payload->>'company_id')::uuid; unit uuid:=(payload->>'business_unit_id')::uuid; inv uuid; item jsonb; mat public.inventory_materials%rowtype; qty numeric; price numeric; new_stock numeric; dist_access boolean;
begin
 dist_access:=public.has_permission('finance.distribution.stock.manage') and exists(select 1 from public.business_units b where b.id=unit and b.company_id=company and b.code='DA');
 if actor is null or not public.can_access_unit(company,unit) or not (public.has_permission('inventory.purchases.create') or dist_access) then raise exception 'Usuario no autorizado'; end if;
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
declare actor uuid:=auth.uid(); company uuid:=(payload->>'company_id')::uuid; unit uuid:=(payload->>'business_unit_id')::uuid; mat public.inventory_materials%rowtype; qty numeric:=(payload->>'quantity')::numeric; kind public.inventory_movement_type:=(payload->>'output_type')::public.inventory_movement_type; result uuid; after_stock numeric; dist_access boolean;
begin
 dist_access:=public.has_permission('finance.distribution.stock.manage') and exists(select 1 from public.business_units b where b.id=unit and b.company_id=company and b.code='DA');
 if actor is null or not public.can_access_unit(company,unit) or not (public.has_permission('inventory.outputs.create') or dist_access) then raise exception 'Usuario no autorizado'; end if;
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

revoke all on function public.ensure_distribution_stock_catalog(uuid) from public,anon;
grant execute on function public.ensure_distribution_stock_catalog(uuid) to authenticated,service_role;

create policy dist_stock_materials_read on public.inventory_materials for select to authenticated using(
 public.has_permission('finance.distribution.stock.view') and public.can_access_unit(company_id,business_unit_id)
 and exists(select 1 from public.business_units b where b.id=business_unit_id and b.code='DA'));
create policy dist_stock_invoices_read on public.inventory_purchase_invoices for select to authenticated using(
 public.has_permission('finance.distribution.stock.view') and public.can_access_unit(company_id,business_unit_id)
 and exists(select 1 from public.business_units b where b.id=business_unit_id and b.code='DA'));
create policy dist_stock_lines_read on public.inventory_purchase_lines for select to authenticated using(exists(
 select 1 from public.inventory_purchase_invoices i join public.business_units b on b.id=i.business_unit_id
 where i.id=invoice_id and b.code='DA' and public.can_access_unit(i.company_id,i.business_unit_id)
 and public.has_permission('finance.distribution.stock.view')));
create policy dist_stock_outputs_read on public.inventory_outputs for select to authenticated using(
 public.has_permission('finance.distribution.stock.view') and public.can_access_unit(company_id,business_unit_id)
 and exists(select 1 from public.business_units b where b.id=business_unit_id and b.code='DA'));
create policy dist_stock_movements_read on public.inventory_movements for select to authenticated using(
 public.has_permission('finance.distribution.stock.view') and public.can_access_unit(company_id,business_unit_id)
 and exists(select 1 from public.business_units b where b.id=business_unit_id and b.code='DA'));
create policy dist_stock_suppliers_read on public.suppliers for select to authenticated using(
 public.has_permission('finance.distribution.stock.view') and public.can_access_company(company_id));

-- Las tablas del libro mayor no se escriben directamente desde el cliente:
-- las entradas y salidas pasan exclusivamente por las funciones transaccionales.
grant select on public.inventory_materials,public.inventory_purchase_invoices,
 public.inventory_purchase_lines,public.inventory_outputs,public.inventory_movements to authenticated;
grant all on public.inventory_materials,public.inventory_purchase_invoices,
 public.inventory_purchase_lines,public.inventory_outputs,public.inventory_movements to service_role;

create or replace function public.storage_unit_id(object_name text) returns uuid language plpgsql immutable set search_path='' as $$
begin return nullif(split_part(object_name,'/',2),'')::uuid; exception when invalid_text_representation then return null; end $$;
revoke all on function public.storage_unit_id(text) from public,anon;
grant execute on function public.storage_unit_id(text) to authenticated,service_role;

create policy dist_stock_invoices_insert on storage.objects for insert to authenticated with check(
 bucket_id='inventory-invoices' and public.has_permission('finance.distribution.stock.manage')
 and public.can_access_unit(public.storage_company_id(name),public.storage_unit_id(name))
 and exists(select 1 from public.business_units b where b.id=public.storage_unit_id(name) and b.code='DA'));
create policy dist_stock_invoices_select on storage.objects for select to authenticated using(
 bucket_id='inventory-invoices' and public.has_permission('finance.distribution.stock.view')
 and public.can_access_unit(public.storage_company_id(name),public.storage_unit_id(name))
 and exists(select 1 from public.business_units b where b.id=public.storage_unit_id(name) and b.code='DA'));
create policy dist_stock_invoices_delete on storage.objects for delete to authenticated using(
 bucket_id='inventory-invoices' and owner_id=(select auth.uid()::text)
 and public.has_permission('finance.distribution.stock.manage')
 and public.can_access_unit(public.storage_company_id(name),public.storage_unit_id(name)));

commit;
