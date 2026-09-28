begin;

-- Foto opcional al inspeccionar una habitación en terreno, como evidencia de
-- que la revisión realmente se hizo. Mismo patrón que las fotos de
-- incidencias (20260928021646/20260928115504): tabla de adjuntos aparte,
-- bucket privado ya existente 'lodging-operations', ruta
-- company/unit/inspection_id/archivo, security definer porque quien
-- inspecciona no necesariamente puede listar lodging_room_inspections vía
-- RLS directo desde storage.

create table public.lodging_room_inspection_photos(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 inspection_id uuid not null references public.lodging_room_inspections(id),
 object_path text not null unique,
 original_name text not null check(char_length(original_name)<=200),
 mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_room_inspection_photos_inspection_idx on public.lodging_room_inspection_photos(inspection_id) where deleted_at is null;
create index lodging_room_inspection_photos_unit_idx on public.lodging_room_inspection_photos(company_id,business_unit_id);
create trigger audit_lodging_room_inspection_photos after insert or update or delete on public.lodging_room_inspection_photos for each row execute function public.audit_row_change();

alter table public.lodging_room_inspection_photos enable row level security;
create policy lodging_room_inspection_photos_select on public.lodging_room_inspection_photos for select to authenticated
using(public.lodging_ops_can_view(company_id,business_unit_id) or uploaded_by=(select auth.uid()));
revoke all on public.lodging_room_inspection_photos from public,anon;
grant select on public.lodging_room_inspection_photos to authenticated;
grant select,insert,update,delete on public.lodging_room_inspection_photos to service_role;

-- ---------- Adjuntar foto ----------
create or replace function public.lodging_inspection_attach(target_inspection uuid,object_path text,mime text,size_bytes bigint,original_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_insp public.lodging_room_inspections; v_id uuid;
begin
 select * into v_insp from public.lodging_room_inspections where id=target_inspection for update;
 if v_insp.id is null or not public.can_access_unit(v_insp.company_id,v_insp.business_unit_id) then raise exception 'Inspeccion no encontrada'; end if;
 if not (v_insp.inspector_id=auth.uid() or public.has_permission('lodging.operations.view')) then raise exception 'Sin autorizacion'; end if;
 if object_path not like v_insp.company_id::text||'/'||v_insp.business_unit_id::text||'/'||v_insp.id::text||'/%' then raise exception 'Ruta invalida'; end if;
 if (select count(*) from public.lodging_room_inspection_photos where inspection_id=v_insp.id and deleted_at is null)>=3 then raise exception 'Maximo 3 fotos por inspeccion'; end if;
 insert into public.lodging_room_inspection_photos(company_id,business_unit_id,inspection_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
 values(v_insp.company_id,v_insp.business_unit_id,v_insp.id,object_path,left(coalesce(original_name,'foto'),200),mime,size_bytes,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_inspection_attach(uuid,text,text,bigint,text) from public,anon;
grant execute on function public.lodging_inspection_attach(uuid,text,text,bigint,text) to authenticated;

-- ---------- Acceso a Storage (mismo bucket que incidencias) ----------
create or replace function public.lodging_inspection_storage_access(object_name text,for_write boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/'); v_insp public.lodging_room_inspections;
begin
 if array_length(parts,1)<>4 or parts[3] !~ '^[0-9a-f-]{36}$' then return false; end if;
 select * into v_insp from public.lodging_room_inspections where id=parts[3]::uuid;
 if v_insp.id is null or v_insp.company_id::text<>parts[1] or v_insp.business_unit_id::text<>parts[2]
  or not public.can_access_unit(v_insp.company_id,v_insp.business_unit_id) then return false; end if;
 if for_write then return v_insp.inspector_id=auth.uid(); end if;
 return v_insp.inspector_id=auth.uid() or public.lodging_ops_can_view(v_insp.company_id,v_insp.business_unit_id);
end $$;
revoke execute on function public.lodging_inspection_storage_access(text,boolean) from public,anon;
grant execute on function public.lodging_inspection_storage_access(text,boolean) to authenticated;

-- Políticas adicionales sobre el bucket ya existente: se suman (OR) a las de
-- incidencias, cada una válida para su propio patrón de ruta.
create policy lodging_inspection_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='lodging-operations' and public.lodging_inspection_storage_access(name,true));
create policy lodging_inspection_objects_read on storage.objects for select to authenticated
using (bucket_id='lodging-operations' and public.lodging_inspection_storage_access(name,false));

commit;
