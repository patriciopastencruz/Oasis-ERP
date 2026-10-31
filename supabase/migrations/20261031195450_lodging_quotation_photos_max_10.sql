begin;

-- Una cotización admite hasta 10 fotos (antes 4).
create or replace function public.lodging_quotation_attach(target_quotation uuid,object_path text,mime text,size_bytes bigint,original_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.lodging_quotations; v_id uuid;
begin
 select * into q from public.lodging_quotations where id=target_quotation for update;
 if q.id is null or not public.can_access_unit(q.company_id,q.business_unit_id) or not public.has_permission('lodging.quotations.manage') then raise exception 'Sin autorizacion'; end if;
 if object_path not like q.company_id::text||'/'||q.business_unit_id::text||'/'||q.id::text||'/%' then raise exception 'Ruta invalida'; end if;
 if (select count(*) from public.lodging_quotation_photos where quotation_id=q.id)>=10 then raise exception 'Maximo 10 fotos'; end if;
 insert into public.lodging_quotation_photos(company_id,business_unit_id,quotation_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
 values(q.company_id,q.business_unit_id,q.id,object_path,left(coalesce(original_name,'foto'),200),mime,size_bytes,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_quotation_attach(uuid,text,text,bigint,text) from public,anon;
grant execute on function public.lodging_quotation_attach(uuid,text,text,bigint,text) to authenticated;

commit;
