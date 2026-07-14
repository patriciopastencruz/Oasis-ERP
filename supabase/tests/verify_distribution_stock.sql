\set ON_ERROR_STOP on
begin;

select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set actor_id '00000000-0000-4000-8000-00000000f101'
\set supplier_id '00000000-0000-4000-8000-00000000f102'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'actor_id','authenticated','authenticated','stock-admin@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'actor_id',(select id from public.roles where key='administrator'),'Stock','Administrador','stock-admin@local.test','Administrador',:'actor_id');
insert into public.user_companies(user_id,company_id) values(:'actor_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id)
values(:'actor_id',:'company_id',:'unit_id');
insert into public.suppliers(id,company_id,rut,legal_name,created_by)
values(:'supplier_id',:'company_id','76.123.456-0','Proveedor de envases',:'actor_id');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f101","role":"authenticated"}',true);
select set_config('app.unit',:'unit_id',true);
select public.ensure_distribution_stock_catalog(:'unit_id');

do $$begin
 if (select count(*) from public.inventory_materials where business_unit_id=current_setting('app.unit',true)::uuid and code like 'DA-MP-%')<>8 then
  raise exception 'El catálogo no contiene los ocho productos';
 end if;
end$$;

select id as material_id from public.inventory_materials
where business_unit_id=:'unit_id' and code='DA-MP-ICE-1KG' \gset
select set_config('app.material',:'material_id',true);

select public.register_inventory_invoice(jsonb_build_object(
 'company_id',:'company_id','business_unit_id',:'unit_id','invoice_number','F-TEST-001',
 'supplier_id',:'supplier_id','purchase_date',current_date,'observations','Compra de prueba',
 'lines',jsonb_build_array(jsonb_build_object('material_id',:'material_id','quantity',10,'unit_price',100))
));
select public.register_inventory_output(jsonb_build_object(
 'company_id',:'company_id','business_unit_id',:'unit_id','material_id',:'material_id',
 'output_date',current_date,'quantity',3,'output_type','operational_consumption','reason','Producción diaria'
));

do $$begin
 if (select current_stock from public.inventory_materials where id=current_setting('app.material',true)::uuid)<>7 then
  raise exception 'El saldo de stock no fue actualizado';
 end if;
 if (select count(*) from public.inventory_movements where material_id=current_setting('app.material',true)::uuid)<>2 then
  raise exception 'El libro mayor no registró compra y salida';
 end if;
end$$;

rollback;
\echo 'OK: catálogo, factura, entrada, salida y trazabilidad de stock verificados.'
