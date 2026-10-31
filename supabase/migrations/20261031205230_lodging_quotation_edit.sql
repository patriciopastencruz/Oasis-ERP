begin;

-- Edición de cotizaciones de hospedaje emitidas. El folio, la fecha de emisión
-- y el hostal no cambian; los ítems se reemplazan y los totales se recalculan
-- siempre en la base. Cada cambio queda en audit_logs por los triggers de las
-- tablas. Una cotización anulada no se puede editar.

alter table public.lodging_quotations
 add column last_edited_by uuid references public.profiles(id),
 add column last_edited_at timestamptz;

create or replace function public.lodging_update_quotation(target_quotation uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); q public.lodging_quotations; l jsonb; i integer:=0;
 v_company text:=btrim(coalesce(payload->>'client_company',''));
 v_in date:=nullif(payload->>'check_in','')::date; v_out date:=nullif(payload->>'check_out','')::date;
 qty integer; unit_net numeric; nights integer; sub numeric; vat numeric; t_net numeric:=0; t_iva numeric:=0; lines jsonb:=payload->'lines';
begin
 select * into q from public.lodging_quotations where id=target_quotation for update;
 if me is null or q.id is null or not public.can_access_unit(q.company_id,q.business_unit_id)
  or not public.has_permission('lodging.quotations.manage') then raise exception 'Sin autorizacion'; end if;
 if q.status<>'issued' then raise exception 'Una cotizacion anulada no se puede editar'; end if;
 if char_length(v_company)<2 or char_length(v_company)>160 then raise exception 'Indica la empresa'; end if;
 if lines is null or jsonb_typeof(lines)<>'array' or jsonb_array_length(lines)<1 then raise exception 'La cotizacion requiere al menos un item'; end if;
 if jsonb_array_length(lines)>20 then raise exception 'Maximo 20 items'; end if;
 if v_in is not null and v_out is not null and v_out<=v_in then raise exception 'La salida debe ser posterior a la entrada'; end if;
 delete from public.lodging_quotation_lines where quotation_id=q.id;
 for l in select * from jsonb_array_elements(lines) loop
  i:=i+1;
  qty:=(l->>'quantity')::integer; unit_net:=(l->>'unit_net')::numeric; nights:=(l->>'nights')::integer;
  if qty is null or qty<1 or unit_net is null or unit_net<0 or unit_net<>trunc(unit_net) or nights is null or nights<1 then raise exception 'Item % invalido',i; end if;
  sub:=qty*unit_net*nights; vat:=round(sub*0.19);
  insert into public.lodging_quotation_lines(company_id,business_unit_id,quotation_id,position,description,quantity,unit_net,nights,subtotal,iva,total)
  values(q.company_id,q.business_unit_id,q.id,i,btrim(coalesce(l->>'description','')),qty,unit_net,nights,sub,vat,sub+vat);
  t_net:=t_net+sub; t_iva:=t_iva+vat;
 end loop;
 update public.lodging_quotations set
  client_company=v_company,
  client_rut=nullif(btrim(coalesce(payload->>'client_rut','')),''),
  client_contact=nullif(btrim(coalesce(payload->>'client_contact','')),''),
  client_email=nullif(btrim(coalesce(payload->>'client_email','')),''),
  hostel_address=nullif(btrim(coalesce(payload->>'hostel_address','')),''),
  service_detail=nullif(btrim(coalesce(payload->>'service_detail','')),''),
  check_in=v_in,check_out=v_out,net=t_net,iva=t_iva,total=t_net+t_iva,
  last_edited_by=me,last_edited_at=now(),updated_at=now()
 where id=q.id;
end $$;
revoke execute on function public.lodging_update_quotation(uuid,jsonb) from public,anon;
grant execute on function public.lodging_update_quotation(uuid,jsonb) to authenticated;

-- Quitar una foto de una cotización emitida; devuelve la ruta para borrar el archivo.
create or replace function public.lodging_quotation_photo_remove(target_photo uuid) returns text language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); ph public.lodging_quotation_photos; q public.lodging_quotations;
begin
 select * into ph from public.lodging_quotation_photos where id=target_photo;
 if ph.id is null then raise exception 'Foto no encontrada'; end if;
 select * into q from public.lodging_quotations where id=ph.quotation_id for update;
 if me is null or not public.can_access_unit(q.company_id,q.business_unit_id) or not public.has_permission('lodging.quotations.manage') then raise exception 'Sin autorizacion'; end if;
 if q.status<>'issued' then raise exception 'Una cotizacion anulada no se puede editar'; end if;
 delete from public.lodging_quotation_photos where id=ph.id;
 update public.lodging_quotations set last_edited_by=me,last_edited_at=now(),updated_at=now() where id=q.id;
 return ph.object_path;
end $$;
revoke execute on function public.lodging_quotation_photo_remove(uuid) from public,anon;
grant execute on function public.lodging_quotation_photo_remove(uuid) to authenticated;

-- Quien puede subir y ver las fotos de la cotización también puede borrar el archivo.
create policy lodging_quotation_objects_delete on storage.objects for delete to authenticated
using (bucket_id='lodging-operations' and public.lodging_quotation_storage_access(name));

commit;
