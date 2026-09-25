begin;

-- Las cotizaciones de Oasis Modulares ya no requieren aprobación: quien la
-- crea la genera de inmediato (número correlativo + estado 'approved', con
-- PDF disponible). Es la misma rama de "autoaprobación" que hasta ahora
-- solo tenían quienes podían aprobar (20260721060000), extendida a todos
-- los que pueden crear cotizaciones. Las que ya están 'pending' siguen su
-- curso normal: quien tiene sales.quotations.approve puede resolverlas.
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
    status='approved',submitted_at=now(),reviewed_by=me,reviewed_at=now(),
    resolution_comment=null,updated_by=me,updated_at=now() where id=q.id;
 else
  update public.om_quotations set
    status='approved',submitted_at=now(),reviewed_by=me,reviewed_at=now(),
    resolution_comment=null,updated_by=me,updated_at=now() where id=q.id;
 end if;
end $$;

-- Sin paso de aprobación tampoco hay ciclo "rechazada → corregir", así que
-- quien creó la cotización puede corregirla o eliminarla mientras siga
-- 'approved' (no entregada ni convertida en proyecto: el proyecto se revisa
-- en la aplicación, igual que la reversión de decisión).
create or replace function public.om_update_quotation(target_quotation uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations; line jsonb; pos int:=0; subtotal_value numeric:=0; discount_value numeric:=coalesce((payload->>'discount')::numeric,0);
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected','approved') then raise exception 'La cotizacion ya no admite ediciones'; end if;
 if exists(select 1 from public.om_projects where quotation_id=q.id) then raise exception 'La cotizacion ya fue convertida en proyecto'; end if;
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

create or replace function public.om_delete_quotation(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations;
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected','approved') then raise exception 'Solo se pueden eliminar cotizaciones que aun no fueron entregadas'; end if;
 if exists(select 1 from public.om_projects where quotation_id=q.id) then raise exception 'La cotizacion ya fue convertida en proyecto'; end if;
 update public.om_quotations set deleted_at=now(),updated_by=me,updated_at=now() where id=q.id;
end $$;

commit;
