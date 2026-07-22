begin;

create type public.inventory_payment_method as enum (
 'cash','debit_card','credit_card','bank_transfer'
);

alter table public.inventory_purchase_invoices
 add column payment_method public.inventory_payment_method not null default 'cash';
alter table public.inventory_purchase_invoices alter column payment_method drop default;

create or replace function public.register_inventory_invoice(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid:=(payload->>'company_id')::uuid; unit uuid:=(payload->>'business_unit_id')::uuid; inv uuid; item jsonb; mat public.inventory_materials%rowtype; qty numeric; price numeric; new_stock numeric;
begin
 if actor is null or not public.can_access_unit(company,unit) or not public.has_permission('inventory.purchases.create') then raise exception 'Usuario no autorizado'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'))=0 then raise exception 'La factura debe incluir productos'; end if;
 if not exists(select 1 from public.suppliers s where s.id=(payload->>'supplier_id')::uuid and s.company_id=company and s.active and s.deleted_at is null) then raise exception 'Proveedor inválido para la empresa'; end if;
 insert into public.inventory_purchase_invoices(company_id,business_unit_id,invoice_number,supplier_id,purchase_date,payment_method,observations,attachment_path,attachment_name,attachment_mime,attachment_size,entered_by)
 values(company,unit,trim(payload->>'invoice_number'),(payload->>'supplier_id')::uuid,(payload->>'purchase_date')::date,(payload->>'payment_method')::public.inventory_payment_method,nullif(trim(payload->>'observations'),''),nullif(payload->>'attachment_path',''),nullif(payload->>'attachment_name',''),nullif(payload->>'attachment_mime',''),nullif(payload->>'attachment_size','')::bigint,actor) returning id into inv;
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

commit;
