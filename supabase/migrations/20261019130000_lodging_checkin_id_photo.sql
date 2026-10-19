begin;

-- Check-in online: foto del carnet o pasaporte y hora de salida. El huésped
-- sube la foto del frente (obligatoria; el reverso no se pide); el servidor las guarda en un bucket
-- privado en la carpeta de la reserva (empresa/hostal/reserva/archivo). Solo
-- el personal con acceso a las reservas del hostal las ve, a través del ERP
-- con sesión iniciada. Al reemplazar una foto se borra la anterior.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lodging-guest-documents','lodging-guest-documents',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.lodging_checkin_links add column document_front_path text, add column document_back_path text;

-- Lectura de fotos: personal con acceso al hostal y permiso de ver reservas.
create or replace function public.lodging_guest_document_access(object_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/'); v_res public.lodging_reservations;
begin
 if array_length(parts,1)<>4 or parts[3] !~ '^[0-9a-f-]{36}$' then return false; end if;
 select * into v_res from public.lodging_reservations where id=parts[3]::uuid;
 return v_res.id is not null and v_res.company_id::text=parts[1] and v_res.business_unit_id::text=parts[2]
  and public.can_access_unit(v_res.company_id,v_res.business_unit_id) and public.has_permission('lodging.reservations.view');
end $$;
revoke execute on function public.lodging_guest_document_access(text) from public,anon;
grant execute on function public.lodging_guest_document_access(text) to authenticated;
create policy lodging_guest_documents_read on storage.objects for select to authenticated
 using(bucket_id='lodging-guest-documents' and public.lodging_guest_document_access(name));
-- Sin políticas de escritura: solo el servidor (service role) sube y borra.

-- Carpeta de la reserva para un link vigente (uso del servidor).
create or replace function public.lodging_checkin_upload_prefix(p_token text) returns text language plpgsql stable security definer set search_path='' as $$
declare l public.lodging_checkin_links;
begin
 l:=public.lodging_checkin_link_valid(p_token);
 if l.id is null then return null; end if;
 return l.company_id||'/'||l.business_unit_id||'/'||l.reservation_id||'/';
end $$;
revoke execute on function public.lodging_checkin_upload_prefix(text) from public,anon,authenticated;
grant execute on function public.lodging_checkin_upload_prefix(text) to service_role;

create or replace function public.lodging_checkin_get(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.lodging_checkin_links; r public.lodging_reservations; g public.lodging_guests; room_name text; unit_name text; unit_code text;
begin
 l:=public.lodging_checkin_link_valid(p_token);
 if l.id is null then return null; end if;
 select * into r from public.lodging_reservations where id=l.reservation_id;
 select * into g from public.lodging_guests where id=r.guest_id;
 select name into room_name from public.lodging_rooms where id=r.room_id;
 select name,code into unit_name,unit_code from public.business_units where id=r.business_unit_id;
 return jsonb_build_object(
  'unit',unit_name,'unit_code',unit_code,'room',room_name,'check_in',r.check_in,'check_out',r.check_out,'guest_count',r.guest_count,
  'submitted_at',l.submitted_at,
  'has_document_front',l.document_front_path is not null,'has_document_back',l.document_back_path is not null,
  -- Datos ya enviados por el huésped; si no, solo el nombre real de la reserva (no los textos de Booking/Airbnb).
  'data',coalesce(l.submission,jsonb_build_object(
   'full_name',case when g.full_name is null or g.full_name ~* '^reserva ' then null else g.full_name end,
   'estimated_arrival',to_char(r.estimated_arrival,'HH24:MI'),'estimated_departure',to_char(r.estimated_departure,'HH24:MI'))));
end $$;


drop function public.lodging_checkin_submit(text,jsonb);
create function public.lodging_checkin_submit(p_token text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.lodging_checkin_links; r public.lodging_reservations; clean jsonb; companions jsonb:='[]'::jsonb; c jsonb;
 v_name text:=left(btrim(coalesce(p_payload->>'full_name','')),160);
 v_doc text:=left(btrim(coalesce(p_payload->>'document','')),40);
 v_nat text:=left(btrim(coalesce(p_payload->>'nationality','')),80);
 v_email text:=left(lower(btrim(coalesce(p_payload->>'email',''))),160);
 v_phone text:=left(btrim(coalesce(p_payload->>'phone','')),40);
 v_arrival text:=nullif(btrim(coalesce(p_payload->>'estimated_arrival','')),'');
 v_departure text:=nullif(btrim(coalesce(p_payload->>'estimated_departure','')),'');
 v_plate text:=upper(left(btrim(coalesce(p_payload->>'license_plate','')),20));
 v_notes text:=left(btrim(coalesce(p_payload->>'notes','')),1000);
 v_front text:=nullif(p_payload->>'document_front_path',''); v_back text:=nullif(p_payload->>'document_back_path',''); v_prefix text; replaced jsonb:='[]'::jsonb;
begin
 l:=public.lodging_checkin_link_valid(p_token);
 if l.id is null then raise exception 'Link no disponible'; end if;
 if char_length(v_name)<3 then raise exception 'Indica tu nombre completo'; end if;
 if char_length(v_doc)<4 then raise exception 'Indica tu documento'; end if;
 if char_length(v_nat)<2 then raise exception 'Indica tu nacionalidad'; end if;
 if v_email<>'' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo invalido'; end if;
 if char_length(v_phone)<6 then raise exception 'Indica tu telefono'; end if;
 if v_arrival is not null and v_arrival !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora de llegada invalida'; end if;
 if v_departure is not null and v_departure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora de salida invalida'; end if;
 if coalesce((p_payload->>'accept_rules')::boolean,false) is not true then raise exception 'Debes aceptar las normas del hostal'; end if;
 if jsonb_typeof(coalesce(p_payload->'companions','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'companions','[]'::jsonb))>10 then raise exception 'Acompanantes invalidos'; end if;
 for c in select * from jsonb_array_elements(coalesce(p_payload->'companions','[]'::jsonb)) loop
  if char_length(btrim(coalesce(c->>'full_name','')))>=3 then
   companions:=companions||jsonb_build_array(jsonb_build_object('full_name',left(btrim(c->>'full_name'),160),'document',left(btrim(coalesce(c->>'document','')),40)));
  end if;
 end loop;
 -- Fotos del documento: rutas subidas por el servidor dentro de la carpeta de esta reserva.
 v_prefix:=l.company_id||'/'||l.business_unit_id||'/'||l.reservation_id||'/';
 if v_front is not null and (left(v_front,char_length(v_prefix))<>v_prefix or v_front !~ '^[0-9a-f/-]+\.(jpg|png|webp)$') then raise exception 'Foto invalida'; end if;
 if v_back is not null and (left(v_back,char_length(v_prefix))<>v_prefix or v_back !~ '^[0-9a-f/-]+\.(jpg|png|webp)$') then raise exception 'Foto invalida'; end if;
 if coalesce(v_front,l.document_front_path) is null then raise exception 'Sube la foto de tu documento'; end if;
 clean:=jsonb_build_object('full_name',v_name,'document',v_doc,'nationality',v_nat,'email',nullif(v_email,''),'phone',v_phone,
  'estimated_arrival',v_arrival,'estimated_departure',v_departure,'license_plate',nullif(v_plate,''),'notes',nullif(v_notes,''),'companions',companions,'accepted_rules_at',now(),
  'has_document_front',true,'has_document_back',coalesce(v_back,l.document_back_path) is not null);
 select * into r from public.lodging_reservations where id=l.reservation_id for update;
 if v_front is not null and l.document_front_path is not null and l.document_front_path<>v_front then replaced:=replaced||to_jsonb(l.document_front_path); end if;
 if v_back is not null and l.document_back_path is not null and l.document_back_path<>v_back then replaced:=replaced||to_jsonb(l.document_back_path); end if;
 update public.lodging_checkin_links set submission=clean,submitted_at=now(),
  document_front_path=coalesce(v_front,document_front_path),document_back_path=coalesce(v_back,document_back_path) where id=l.id;
 if r.guest_id is null then
  insert into public.lodging_guests(company_id,business_unit_id,full_name,document,nationality,email,phone)
  values(r.company_id,r.business_unit_id,v_name,v_doc,v_nat,nullif(v_email,''),v_phone) returning id into r.guest_id;
  update public.lodging_reservations set guest_id=r.guest_id where id=r.id;
 else
  update public.lodging_guests set full_name=v_name,document=v_doc,nationality=v_nat,email=coalesce(nullif(v_email,''),email),phone=v_phone,updated_at=now()
  where id=r.guest_id;
 end if;
 update public.lodging_reservations set estimated_arrival=coalesce(v_arrival::time,estimated_arrival),
  estimated_departure=coalesce(v_departure::time,estimated_departure),
  license_plate=coalesce(nullif(v_plate,''),license_plate) where id=r.id;
 -- Aviso a recepción del hostal (sin correo).
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select r.company_id,r.business_unit_id,p.id,'lodging.checkin.submitted','Check-in online completado',
  v_name||' completó sus datos para la estadía del '||to_char(r.check_in,'DD-MM')||' al '||to_char(r.check_out,'DD-MM')||'.',
  'lodging_reservation',r.id,null
 from public.profiles p join public.user_business_units u on u.user_id=p.id and u.business_unit_id=r.business_unit_id
 where p.active and p.deleted_at is null and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=p.role_id and k.key='lodging.reservations.manage' and k.active);
 -- Fotos reemplazadas: el servidor las borra del almacenamiento.
 return jsonb_build_object('replaced',replaced);
end $$;


revoke execute on function public.lodging_checkin_get(text),public.lodging_checkin_submit(text,jsonb) from public,anon,authenticated;
grant execute on function public.lodging_checkin_get(text),public.lodging_checkin_submit(text,jsonb) to service_role;

commit;
